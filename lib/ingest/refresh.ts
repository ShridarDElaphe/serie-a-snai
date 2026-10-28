import { createHash } from "node:crypto";
import { all, get, metaGet, metaSet, run, transaction, wipeDatabase } from "../db";
import { assignMatchdays, focusMatchdays } from "../matchday";
import { cardSampleFromCounts, decide } from "../model/engine";
import { comboHits } from "../combo";
import { lastName, mentionsAlias } from "../teams";
import type {
  BookPrice,
  DecideInput,
  FinishedMatch,
  LineupPlayer,
  PlayerSeason,
  PriceLine,
  ProposalDraft,
  SourceState,
  StandingRow,
} from "../types";
import {
  addDays,
  parseBookOdds,
  parseRoster,
  parseScoreboard,
  parseStandings,
  parseSummary,
  ymd,
  type ParsedMatch,
} from "./espn";
import { probeFootballData } from "./football-data";
import { loadBetflagPrices, romeDay, sameTeams } from "./betflag";
import { cachedQuoteNotes, probeQuoteSources, quoteNoteSentence } from "./quotes";
import { fetchJson, pool } from "./http";
import { attachTeams, FEEDS, readFeed } from "./news";
import { sampleMatches } from "./sample";

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard";
const STANDINGS = "https://site.api.espn.com/apis/v2/sports/soccer/ita.1/standings";
const ROSTER = (id: string) => `https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/teams/${id}/roster`;
const SUMMARY = (id: string) => `https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=${id}`;

type Mode = "startup" | "news" | "lineups" | "rosters";

type MatchRow = {
  id: string;
  provider: string;
  kickoff: string;
  matchday: number | null;
  status: string;
  minute: string | null;
  home_id: string;
  home_name: string;
  away_id: string;
  away_name: string;
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
  referee: string | null;
  summary_done: number;
};

const state = globalThis as unknown as {
  __margineLoop?: { running: boolean; pending: Set<Mode>; started: boolean };
};

function loopState() {
  return (state.__margineLoop ??= { running: false, pending: new Set(), started: false });
}

function defaultSource(): SourceState {
  return {
    sample: false,
    fixtures: "assente",
    footballDataHttp: null,
    footballDataNote: "Non ancora interrogata.",
    espn: "non tentato",
    news: {},
    lineups: "dato assente",
    referee: "dato assente",
    injuries: "dato assente",
    minutes: "dato assente",
    odds: [],
    updatedAt: null,
    matchCount: 0,
    phase: "in attesa",
    error: null,
  };
}

function readSource(): SourceState {
  const raw = metaGet("source");
  if (!raw) return defaultSource();
  try {
    return { ...defaultSource(), ...(JSON.parse(raw) as SourceState) };
  } catch {
    return defaultSource();
  }
}

function saveSource(patch: Partial<SourceState>) {
  const next = { ...readSource(), ...patch, updatedAt: new Date().toISOString() };
  metaSet("source", JSON.stringify(next));
}

function proposalId(origin: string, matchId: string, market: string, selection: string) {
  return createHash("sha1").update(`${origin}|${matchId}|${market}|${selection}`).digest("hex").slice(0, 20);
}

function storeMatches(matches: ParsedMatch[], provider: string) {
  const now = new Date().toISOString();
  transaction(() => {
    for (const match of matches) {
      run(
        `INSERT INTO matches (
          id, provider, kickoff, matchday, status, minute, home_id, home_name, away_id, away_name,
          home_score, away_score, venue, referee, summary_done, updated_at
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          minute = excluded.minute,
          home_name = excluded.home_name,
          away_name = excluded.away_name,
          home_score = excluded.home_score,
          away_score = excluded.away_score,
          venue = COALESCE(excluded.venue, matches.venue),
          referee = COALESCE(excluded.referee, matches.referee),
          updated_at = excluded.updated_at`,
        match.id,
        provider,
        match.kickoff,
        match.status,
        match.minute,
        match.homeId,
        match.homeName,
        match.awayId,
        match.awayName,
        match.homeScore,
        match.awayScore,
        match.venue,
        match.referee,
        now,
      );
      for (const team of [
        [match.homeId, match.homeName],
        [match.awayId, match.awayName],
      ] as const) {
        run(
          `INSERT INTO teams(id, name, raw_name) VALUES(?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
          team[0],
          team[1],
          team[1],
        );
      }
    }
  });
  const rows = all<{ id: string; kickoff: string }>("SELECT id, kickoff FROM matches");
  const days = assignMatchdays(rows);
  transaction(() => {
    for (const [id, day] of days) run("UPDATE matches SET matchday = ? WHERE id = ?", day, id);
  });
}

function storeBookOdds(rows: BookPrice[]) {
  if (!rows.length) return;
  transaction(() => {
    for (const row of rows) {
      run(
        `INSERT INTO match_odds(match_id, bookmaker, source, read_at, q1, qx, q2, total_line, over_q, under_q)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(match_id) DO UPDATE SET
           bookmaker = excluded.bookmaker,
           source = excluded.source,
           read_at = excluded.read_at,
           q1 = excluded.q1,
           qx = excluded.qx,
           q2 = excluded.q2,
           total_line = excluded.total_line,
           over_q = excluded.over_q,
           under_q = excluded.under_q`,
        row.matchId,
        row.bookmaker,
        row.source,
        row.readAt,
        row.home,
        row.draw,
        row.away,
        row.totalLine,
        row.over,
        row.under,
      );
    }
  });
}

async function syncEspn(): Promise<boolean> {
  const opening = await fetchJson(SCOREBOARD);
  const first = parseScoreboard(opening);
  const readAt = new Date().toISOString();
  const odds = new Map<string, BookPrice>();
  for (const row of parseBookOdds(opening, readAt)) odds.set(row.matchId, row);
  const today = ymd(new Date());
  const recent = ymd(addDays(new Date(), -2));
  const nearEnd = ymd(addDays(new Date(), 21));
  const wanted = [...new Set(first.dates.length ? first.dates : [today])];
  const finals = new Set<string>(JSON.parse(metaGet("final_dates") ?? "[]") as string[]);
  const seen = new Set<string>(JSON.parse(metaGet("seen_dates") ?? "[]") as string[]);
  const farRefresh = metaGet("far_refresh_at");
  const farStale = !farRefresh || Date.now() - Date.parse(farRefresh) > 6 * 3_600_000;
  const todo = wanted.filter((date) => {
    if (date >= recent && date <= nearEnd) return true;
    if (!seen.has(date)) return true;
    if (finals.has(date) && date < recent) return false;
    return farStale;
  });
  const collected = new Map<string, ParsedMatch>();
  for (const match of first.matches) collected.set(match.id, match);
  let done = 0;
  await pool(todo, 6, async (date) => {
    try {
      const payload = await fetchJson(`${SCOREBOARD}?dates=${date}`);
      const board = parseScoreboard(payload);
      for (const row of parseBookOdds(payload, readAt)) odds.set(row.matchId, row);
      for (const match of board.matches) collected.set(match.id, match);
      const old = date < recent;
      seen.add(date);
      if (old && board.matches.length && board.matches.every((match) => match.status === "finita" || match.status === "rinviata")) {
        finals.add(date);
      }
    } catch (error) {
      console.error("[margine] calendario", date, error instanceof Error ? error.message : error);
    }
    done += 1;
    if (done % 5 === 0) saveSource({ phase: `Calendario Serie A ${done}/${todo.length}` });
  });
  if (!collected.size) return false;
  if (metaGet("data_origin") === "sample") wipeDatabase();
  storeMatches([...collected.values()], "espn");
  storeBookOdds([...odds.values()]);
  try {
    const table = parseStandings(await fetchJson(STANDINGS));
    const updated = new Date().toISOString();
    transaction(() => {
      for (const row of table) {
        run(
          `INSERT INTO standings(team_id, name, rank, played, won, drawn, lost, gf, ga, points, updated_at)
           VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(team_id) DO UPDATE SET
             name = excluded.name, rank = excluded.rank, played = excluded.played, won = excluded.won,
             drawn = excluded.drawn, lost = excluded.lost, gf = excluded.gf, ga = excluded.ga,
             points = excluded.points, updated_at = excluded.updated_at`,
          row.teamId,
          row.name,
          row.rank,
          row.played,
          row.won,
          row.drawn,
          row.lost,
          row.gf,
          row.ga,
          row.points,
          updated,
        );
        run(
          "INSERT INTO teams(id, name, raw_name) VALUES(?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, raw_name = excluded.raw_name",
          row.teamId,
          row.name,
          row.rawName,
        );
      }
    });
  } catch (error) {
    console.error("[margine] classifica", error instanceof Error ? error.message : error);
  }
  metaSet("final_dates", JSON.stringify([...finals]));
  metaSet("seen_dates", JSON.stringify([...seen]));
  if (farStale) metaSet("far_refresh_at", new Date().toISOString());
  metaSet("calendar_dates", String(wanted.length));
  metaSet("data_origin", "espn");
  if (!metaGet("first_run_at")) metaSet("first_run_at", new Date().toISOString());
  saveSource({
    sample: false,
    fixtures: "espn",
    espn: "ok",
    matchCount: collected.size,
    phase: "Calendario letto",
    error: null,
  });
  console.log(`[margine] ESPN partite ${collected.size}`);
  return true;
}

async function syncFixtures() {
  const footballData = await probeFootballData();
  saveSource({ footballDataHttp: footballData.status, footballDataNote: footballData.note });
  console.log(`[margine] football-data ${footballData.status} ${footballData.note}`);
  if (footballData.matches && footballData.matches.length >= 10) {
    if (metaGet("data_origin") === "sample") wipeDatabase();
    storeMatches(footballData.matches, "football-data");
    metaSet("data_origin", "football-data");
    if (!metaGet("first_run_at")) metaSet("first_run_at", new Date().toISOString());
    saveSource({
      sample: false,
      fixtures: "football-data",
      espn: "non tentato",
      matchCount: footballData.matches.length,
      error: null,
    });
    return;
  }
  try {
    const ok = await syncEspn();
    if (!ok) throw new Error("ESPN non ha restituito partite");
  } catch (error) {
    const message = error instanceof Error ? error.message : "errore ESPN";
    console.error("[margine]", message);
    saveSource({ espn: "errore", error: message });
    if ((get<{ n: number }>("SELECT COUNT(*) AS n FROM matches")?.n ?? 0) === 0) {
      storeMatches(sampleMatches(), "sample");
      metaSet("data_origin", "sample");
      if (!metaGet("first_run_at")) metaSet("first_run_at", new Date().toISOString());
      saveSource({
        sample: true,
        fixtures: "sample",
        matchCount: sampleMatches().length,
        phase: "Dati di esempio",
        error: message,
      });
    }
  }
}

async function syncRosters() {
  if (metaGet("data_origin") === "sample") {
    saveSource({ injuries: "dato assente", lineups: "dato assente" });
    return;
  }
  const teams = all<{ id: string }>("SELECT id FROM teams WHERE id NOT LIKE 'sample-%' AND id NOT LIKE 'fd-%'");
  let ok = 0;
  let injuryCount = 0;
  await pool(teams, 4, async (team) => {
    try {
      const roster = parseRoster(await fetchJson(ROSTER(team.id)), team.id);
      const updated = new Date().toISOString();
      transaction(() => {
        run("DELETE FROM players WHERE team_id = ?", team.id);
        run("DELETE FROM injuries WHERE team_id = ?", team.id);
        for (const player of roster.players) {
          run(
            `INSERT INTO players(player_id, team_id, name, position, appearances, sub_ins, goals, yellows, reds, fouls, updated_at)
             VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            player.playerId,
            player.teamId,
            player.name,
            player.position,
            player.appearances,
            player.subIns,
            player.goals,
            player.yellows,
            player.reds,
            player.fouls,
            updated,
          );
        }
        for (const injury of roster.injuries) {
          const id = createHash("sha1").update(`${injury.teamId}|${injury.playerName}|${injury.detail}`).digest("hex").slice(0, 16);
          run(
            "INSERT INTO injuries(id, team_id, player_name, detail, updated_at) VALUES(?, ?, ?, ?, ?)",
            id,
            injury.teamId,
            injury.playerName,
            injury.detail,
            updated,
          );
        }
      });
      ok += 1;
      injuryCount += roster.injuries.length;
    } catch (error) {
      console.error("[margine] rosa", team.id, error instanceof Error ? error.message : error);
    }
  });
  saveSource({
    injuries: ok === 0 ? "dato assente" : injuryCount > 0 ? "presenti" : "nessuno segnalato",
  });
  console.log(`[margine] rose ${ok}/${teams.length}, indisponibili ${injuryCount}`);
}

async function syncNews() {
  const teams = all<{ id: string; name: string }>("SELECT id, name FROM teams");
  const newsState: SourceState["news"] = {};
  for (const feed of FEEDS) {
    const result = await readFeed(feed.url);
    const stale =
      feed.id === "gazzetta" &&
      (!result.newest || Date.now() - Date.parse(result.newest) > 14 * 86_400_000);
    if (stale) {
      newsState[feed.id] = {
        status: "scartato: il feed non è aggiornato",
        items: 0,
        newest: result.newest,
      };
      continue;
    }
    if (result.error || !result.items.length) {
      newsState[feed.id] = { status: result.error ?? "vuoto", items: 0, newest: result.newest };
      continue;
    }
    transaction(() => {
      for (const item of result.items) {
        run(
          `INSERT INTO news(id, source, title, summary, link, published_at) VALUES(?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET title = excluded.title, summary = excluded.summary, published_at = excluded.published_at`,
          item.id,
          feed.id,
          item.title,
          item.summary,
          item.link,
          item.publishedAt,
        );
        run("DELETE FROM news_teams WHERE news_id = ?", item.id);
        for (const teamId of attachTeams(item, teams, feed.kind)) {
          run("INSERT OR IGNORE INTO news_teams(news_id, team_id) VALUES(?, ?)", item.id, teamId);
        }
      }
    });
    newsState[feed.id] = { status: "ok", items: result.items.length, newest: result.newest };
  }
  const cutoff = new Date(Date.now() - 21 * 86_400_000).toISOString();
  run("DELETE FROM news_teams WHERE news_id IN (SELECT id FROM news WHERE published_at < ?)", cutoff);
  run("DELETE FROM news WHERE published_at < ?", cutoff);
  saveSource({ news: newsState });
  console.log("[margine] notizie", JSON.stringify(newsState));
}

function currentAndNext(): { current: number | null; next: number | null } {
  const rows = all<{ matchday: number; status: string; kickoff: string }>(
    "SELECT matchday, status, kickoff FROM matches WHERE matchday IS NOT NULL ORDER BY kickoff",
  );
  return focusMatchdays(rows);
}

async function syncSummaries(mode: Mode) {
  if (metaGet("data_origin") === "sample") return;
  const wanted = new Set<string>();
  const matches = all<MatchRow>("SELECT * FROM matches");
  const now = Date.now();
  for (const match of matches) {
    const delta = Date.parse(match.kickoff) - now;
    if (match.status === "in corso" || (delta < 6 * 3_600_000 && delta > -3 * 3_600_000)) wanted.add(match.id);
  }
  if (mode === "startup" || mode === "news") {
    const { current, next } = currentAndNext();
    const focus = new Set([current, next].filter((day): day is number => day != null));
    const teamIds = new Set<string>();
    for (const match of matches) {
      if (match.matchday != null && focus.has(match.matchday)) {
        teamIds.add(match.home_id);
        teamIds.add(match.away_id);
      }
    }
    for (const teamId of teamIds) {
      const recent = all<{ id: string }>(
        `SELECT id FROM matches
         WHERE status = 'finita' AND (home_id = ? OR away_id = ?)
         ORDER BY kickoff DESC LIMIT 4`,
        teamId,
        teamId,
      );
      for (const match of recent) {
        if (!get("SELECT 1 AS ok FROM match_cards WHERE match_id = ?", match.id)) wanted.add(match.id);
      }
    }
  }
  const todo = [...wanted].filter((id) => {
    const match = matches.find((item) => item.id === id);
    return match && !(match.summary_done && match.status === "finita");
  }).slice(0, 30);
  let lineups = 0;
  let referees = 0;
  await pool(todo, 3, async (id) => {
    try {
      const summary = parseSummary(await fetchJson(SUMMARY(id)));
      const match = matches.find((item) => item.id === id);
      const starters = summary.lineups.filter((player) => player.starter).length;
      transaction(() => {
        if (starters >= 11 || match?.status === "finita") {
          run("DELETE FROM lineups WHERE match_id = ?", id);
          for (const player of summary.lineups) {
            run(
              "INSERT INTO lineups(match_id, team_id, player_id, player_name, position, starter) VALUES(?, ?, ?, ?, ?, ?)",
              id,
              player.teamId,
              player.playerId,
              player.name,
              player.position,
              player.starter ? 1 : 0,
            );
          }
          if (starters >= 11) lineups += 1;
        }
        if (summary.cards.length && match && match.status !== "non iniziata") {
          run("DELETE FROM match_cards WHERE match_id = ?", id);
          for (const card of summary.cards) {
            run(
              "INSERT INTO match_cards(match_id, team_id, yellows, reds, fouls) VALUES(?, ?, ?, ?, ?)",
              id,
              card.teamId,
              card.yellows,
              card.reds,
              card.fouls,
            );
          }
        }
        if (match?.status === "finita") {
          run("DELETE FROM match_goals WHERE match_id = ?", id);
          summary.goals.forEach((goal, index) => {
            run(
              "INSERT INTO match_goals(match_id, player_id, player_name, team_id, minute, penalty) VALUES(?, ?, ?, ?, ?, ?)",
              id,
              goal.playerId,
              goal.playerName,
              goal.teamId,
              `${goal.minute}-${index}`,
              goal.penalty ? 1 : 0,
            );
          });
          run("DELETE FROM player_cards WHERE match_id = ?", id);
          for (const card of summary.playerCards) {
            run(
              `INSERT INTO player_cards(match_id, player_id, player_name, team_id, red) VALUES(?, ?, ?, ?, ?)
               ON CONFLICT(match_id, player_id) DO UPDATE SET red = MAX(player_cards.red, excluded.red)`,
              id,
              card.playerId,
              card.playerName,
              card.teamId,
              card.red ? 1 : 0,
            );
          }
          run("UPDATE matches SET summary_done = 1 WHERE id = ?", id);
        }
        if (summary.referee) {
          run("UPDATE matches SET referee = ? WHERE id = ?", summary.referee, id);
          referees += 1;
        }
      });
    } catch (error) {
      console.error("[margine] tabellino", id, error instanceof Error ? error.message : error);
    }
  });
  const anyLineup = get("SELECT 1 AS ok FROM lineups WHERE starter = 1 LIMIT 1");
  const anyReferee = get("SELECT 1 AS ok FROM matches WHERE referee IS NOT NULL LIMIT 1");
  saveSource({
    lineups: anyLineup || lineups > 0 ? "presenti" : "dato assente",
    referee: anyReferee || referees > 0 ? "presente" : "dato assente",
    minutes: "dato assente",
  });
  console.log(`[margine] tabellini richiesti ${todo.length}`);
}

function finishedPrior(kickoff: string): FinishedMatch[] {
  return all<MatchRow>(
    "SELECT * FROM matches WHERE status = 'finita' AND home_score IS NOT NULL AND kickoff < ? ORDER BY kickoff",
    kickoff,
  ).map((match) => ({
    id: match.id,
    kickoff: match.kickoff,
    homeId: match.home_id,
    awayId: match.away_id,
    homeName: match.home_name,
    awayName: match.away_name,
    homeGoals: match.home_score ?? 0,
    awayGoals: match.away_score ?? 0,
  }));
}

function cardProfile(teamId: string, kickoff: string) {
  const recent = all<{ yellows: number; reds: number }>(
    `SELECT c.yellows, c.reds FROM match_cards c
     JOIN matches m ON m.id = c.match_id
     WHERE c.team_id = ? AND m.kickoff < ? AND m.status = 'finita'
     ORDER BY m.kickoff DESC LIMIT 5`,
    teamId,
    kickoff,
  );
  const season = get<{ cards: number; played: number }>(
    `SELECT COALESCE(SUM(yellows + 2 * reds), 0) AS cards,
            (SELECT played FROM standings WHERE team_id = ?) AS played
     FROM players WHERE team_id = ?`,
    teamId,
    teamId,
  );
  return cardSampleFromCounts(
    teamId,
    recent.map((row) => ({ cards: row.yellows + 2 * row.reds })),
    season?.played ? season.cards : null,
    season?.played ?? null,
  );
}

function refereeProfile(name: string | null, kickoff: string) {
  if (!name) return null;
  const rows = all<{ yellows: number; reds: number }>(
    `SELECT c.yellows, c.reds FROM match_cards c
     JOIN matches m ON m.id = c.match_id
     WHERE m.referee = ? AND m.kickoff < ? AND m.status = 'finita'`,
    name,
    kickoff,
  );
  if (!rows.length) return { name, matches: 0, cardsAvg: 0 };
  const byMatch = rows.length / 2;
  const cards = rows.reduce((sum, row) => sum + row.yellows + 2 * row.reds, 0);
  return { name, matches: Math.round(byMatch), cardsAvg: byMatch ? cards / byMatch : 0 };
}

function inputFor(match: MatchRow, live: boolean): DecideInput {
  const players = live
    ? all<PlayerSeason>(
        `SELECT player_id AS playerId, team_id AS teamId, name, position, appearances, sub_ins AS subIns,
                goals, yellows, reds, fouls
         FROM players WHERE team_id IN (?, ?)`,
        match.home_id,
        match.away_id,
      )
    : [];
  const lineupRows = live
    ? all<{ player_id: string; team_id: string; player_name: string; position: string | null; starter: number }>(
        "SELECT player_id, team_id, player_name, position, starter FROM lineups WHERE match_id = ?",
        match.id,
      )
    : [];
  const starters = lineupRows.filter((row) => row.starter).length;
  const lineup: LineupPlayer[] | null =
    starters >= 11
      ? lineupRows.map((row) => ({
          playerId: row.player_id,
          teamId: row.team_id,
          name: row.player_name,
          position: row.position,
          starter: row.starter === 1,
        }))
      : null;
  const standings = live
    ? all<StandingRow>(
        `SELECT team_id AS teamId, name, rank, played, won, drawn, lost, gf, ga, points FROM standings`,
      )
    : null;
  return {
    homeId: match.home_id,
    awayId: match.away_id,
    homeName: match.home_name,
    awayName: match.away_name,
    kickoff: match.kickoff,
    prior: finishedPrior(match.kickoff),
    standings: standings && standings.length ? standings : null,
    players,
    lineup,
    injuries: live
      ? all("SELECT team_id AS teamId, player_name AS playerName, detail FROM injuries WHERE team_id IN (?, ?)", match.home_id, match.away_id)
      : [],
    teamCards: [cardProfile(match.home_id, match.kickoff), cardProfile(match.away_id, match.kickoff)].filter(
      (item): item is NonNullable<typeof item> => item != null,
    ),
    referee: live ? refereeProfile(match.referee, match.kickoff) : null,
    news: live
      ? all<{ id: string; title: string; summary: string; link: string; publishedAt: string; source: string; teamIds: string }>(
          `SELECT n.id, n.title, n.summary, n.link, n.published_at AS publishedAt, n.source,
                  GROUP_CONCAT(nt.team_id) AS teamIds
           FROM news n JOIN news_teams nt ON nt.news_id = n.id
           WHERE nt.team_id IN (?, ?) AND n.published_at > ?
           GROUP BY n.id`,
          match.home_id,
          match.away_id,
          new Date(Date.now() - 6 * 3_600_000).toISOString(),
        ).map((row) => ({
          ...row,
          teamIds: row.teamIds.split(","),
        }))
      : [],
    now: live ? Date.now() : Date.parse(match.kickoff) - 60_000,
    allowSquad: live,
    odds: live ? oddsFor(match.id) : null,
    oddsNote: quoteNoteSentence(),
  };
}

function parseLines(raw: string | null): Record<string, PriceLine> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, { price?: unknown; bookmaker?: unknown }>;
    const lines: Record<string, PriceLine> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value.price !== "number" || !(value.price > 1) || typeof value.bookmaker !== "string") continue;
      lines[key] = { price: value.price, bookmaker: value.bookmaker };
    }
    return lines;
  } catch {
    return {};
  }
}

function oddsFor(matchId: string): BookPrice | null {
  const row = get<{
    bookmaker: string;
    source: string;
    read_at: string;
    q1: number | null;
    qx: number | null;
    q2: number | null;
    total_line: number | null;
    over_q: number | null;
    under_q: number | null;
    lines_json: string | null;
  }>(
    "SELECT bookmaker, source, read_at, q1, qx, q2, total_line, over_q, under_q, lines_json FROM match_odds WHERE match_id = ?",
    matchId,
  );
  if (!row) return null;
  return {
    matchId,
    bookmaker: row.bookmaker,
    source: row.source,
    readAt: row.read_at,
    home: row.q1,
    draw: row.qx,
    away: row.q2,
    totalLine: row.total_line,
    over: row.over_q,
    under: row.under_q,
    lines: parseLines(row.lines_json),
  };
}

function storeBetflagLines(matchId: string, event: {
  lines: Record<string, PriceLine>;
  homePrice: number | null;
  drawPrice: number | null;
  awayPrice: number | null;
  totalLine: number | null;
  over: number | null;
  under: number | null;
}) {
  const readAt = new Date().toISOString();
  const lines = JSON.stringify(event.lines);
  run(
    `INSERT INTO match_odds(match_id, bookmaker, source, read_at, q1, qx, q2, total_line, over_q, under_q, lines_json)
     VALUES(?, 'Betflag', 'sportservice.betflag.it', ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(match_id) DO UPDATE SET
       lines_json = excluded.lines_json,
       q1 = COALESCE(match_odds.q1, excluded.q1),
       qx = COALESCE(match_odds.qx, excluded.qx),
       q2 = COALESCE(match_odds.q2, excluded.q2),
       total_line = COALESCE(match_odds.total_line, excluded.total_line),
       over_q = COALESCE(match_odds.over_q, excluded.over_q),
       under_q = COALESCE(match_odds.under_q, excluded.under_q),
       bookmaker = CASE WHEN match_odds.q1 IS NULL THEN excluded.bookmaker ELSE match_odds.bookmaker END,
       source = CASE WHEN match_odds.q1 IS NULL THEN excluded.source ELSE match_odds.source END`,
    matchId,
    readAt,
    event.homePrice,
    event.drawPrice,
    event.awayPrice,
    event.totalLine,
    event.over,
    event.under,
    lines,
  );
}

function rememberBetflagNote(note: string) {
  const current = readSource();
  saveSource({ odds: [...(current.odds ?? []).filter((line) => !line.startsWith("Betflag")), note] });
}

async function syncBetflag() {
  const at = metaGet("betflag_at");
  const cachedNote = metaGet("betflag_note");
  if (at && cachedNote && Date.now() - Date.parse(at) < 15 * 60_000) {
    rememberBetflagNote(cachedNote);
    return;
  }
  try {
    const loaded = await loadBetflagPrices();
    const matches = all<{ id: string; home_name: string; away_name: string; kickoff: string; status: string }>(
      "SELECT id, home_name, away_name, kickoff, status FROM matches WHERE status = 'non iniziata'",
    );
    let linked = 0;
    for (const event of loaded.events) {
      const match = matches.find(
        (row) => sameTeams(row.home_name, row.away_name, event.home, event.away) && romeDay(row.kickoff) === event.day,
      );
      if (!match) continue;
      storeBetflagLines(match.id, event);
      linked += 1;
    }
    metaSet("betflag_at", new Date().toISOString());
    const note = `${loaded.note} Collegate alle partite ESPN: ${linked}.`;
    metaSet("betflag_note", note);
    rememberBetflagNote(note);
    console.log(`[margine] ${note}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "errore";
    const note = `Betflag sportservice.betflag.it: non raggiungibile (${message}). Doppia chance, multigol, gol/no gol e doppie senza un numero già letto restano dato assente.`;
    metaSet("betflag_note", note);
    rememberBetflagNote(note);
    console.error("[margine] betflag", message);
  }
}

function saveProposals(matchId: string, origin: "live" | "ricostruzione", drafts: ProposalDraft[], freeze: boolean) {
  const now = new Date().toISOString();
  const previous = all<{ id: string; created_at: string; outcome: string; outcome_note: string | null; settled_at: string | null }>(
    "SELECT id, created_at, outcome, outcome_note, settled_at FROM proposals WHERE match_id = ? AND origin = ?",
    matchId,
    origin,
  );
  const kept = new Map(previous.map((row) => [row.id, row]));
  transaction(() => {
    if (!freeze) run("DELETE FROM proposals WHERE match_id = ? AND origin = 'live' AND frozen_at IS NULL", matchId);
    for (const draft of drafts) {
      const id = proposalId(origin, matchId, draft.market, draft.selection);
      const old = kept.get(id);
      run(
        `INSERT INTO proposals(
          id, match_id, market, selection, confidence, sicura, probability, sort_key, reason, safety_note,
          signals_json, form_home, form_away, origin, created_at, frozen_at, outcome, outcome_note, settled_at,
          quota, quota_book
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          confidence = excluded.confidence,
          sicura = excluded.sicura,
          probability = excluded.probability,
          sort_key = excluded.sort_key,
          reason = excluded.reason,
          safety_note = excluded.safety_note,
          signals_json = excluded.signals_json,
          form_home = excluded.form_home,
          form_away = excluded.form_away,
          quota = excluded.quota,
          quota_book = excluded.quota_book,
          frozen_at = COALESCE(proposals.frozen_at, excluded.frozen_at),
          outcome = CASE WHEN proposals.outcome IN ('hit', 'miss', 'non_verificabile') THEN proposals.outcome ELSE excluded.outcome END`,
        id,
        matchId,
        draft.market,
        draft.selection,
        draft.confidence,
        draft.sicura ? 1 : 0,
        draft.probability,
        draft.sortKey,
        draft.reason,
        draft.safetyNote,
        JSON.stringify(draft.signals),
        draft.formHome,
        draft.formAway,
        origin,
        old?.created_at ?? now,
        freeze ? now : null,
        old?.outcome ?? "pending",
        old?.outcome_note ?? null,
        old?.settled_at ?? null,
        draft.quota ?? null,
        draft.quotaBook ?? null,
      );
    }
  });
}

function saveAssessment(matchId: string, result: ReturnType<typeof decide>) {
  run(
    `INSERT INTO assessments(match_id, notes_json, suppressed_json, expected_home, expected_away, updated_at)
     VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(match_id) DO UPDATE SET
       notes_json = excluded.notes_json,
       suppressed_json = excluded.suppressed_json,
       expected_home = excluded.expected_home,
       expected_away = excluded.expected_away,
       updated_at = excluded.updated_at`,
    matchId,
    JSON.stringify(result.notes),
    JSON.stringify(result.suppressed),
    result.expectedHome,
    result.expectedAway,
    new Date().toISOString(),
  );
}

function saveMethod(matchId: string, result: ReturnType<typeof decide>) {
  const fusion = result.fusion;
  run(
    `INSERT INTO match_method(
      match_id, market_1, market_x, market_2, model_1, model_x, model_2, weight, excluded_reason, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET
      market_1 = excluded.market_1,
      market_x = excluded.market_x,
      market_2 = excluded.market_2,
      model_1 = excluded.model_1,
      model_x = excluded.model_x,
      model_2 = excluded.model_2,
      weight = excluded.weight,
      excluded_reason = excluded.excluded_reason,
      updated_at = excluded.updated_at`,
    matchId,
    fusion.market1,
    fusion.marketX,
    fusion.market2,
    fusion.model1,
    fusion.modelX,
    fusion.model2,
    fusion.weight,
    fusion.excludedReason,
    new Date().toISOString(),
  );
}

function recompute() {
  const firstRun = Date.parse(metaGet("first_run_at") ?? new Date().toISOString());
  const matches = all<MatchRow>("SELECT * FROM matches");
  for (const match of matches) {
    const kick = Date.parse(match.kickoff);
    const liveCount = get<{ n: number }>("SELECT COUNT(*) AS n FROM proposals WHERE match_id = ? AND origin = 'live'", match.id)?.n ?? 0;
    const reconCount =
      get<{ n: number }>("SELECT COUNT(*) AS n FROM proposals WHERE match_id = ? AND origin = 'ricostruzione'", match.id)?.n ?? 0;
    const finished = match.status === "finita" && match.home_score != null && match.away_score != null;
    if (finished && kick < firstRun && liveCount === 0 && reconCount === 0) {
      const result = decide(inputFor(match, false));
      saveProposals(match.id, "ricostruzione", result.proposals, true);
      saveAssessment(match.id, result);
      continue;
    }
    if (finished || match.status === "rinviata") continue;
    if (liveCount > 0 && Date.now() >= kick) continue;
    const result = decide(inputFor(match, true));
    saveProposals(match.id, "live", result.proposals, Date.now() >= kick);
    saveAssessment(match.id, result);
    saveMethod(match.id, result);
  }
}

function settle() {
  const pending = all<{
    id: string;
    market: string;
    selection: string;
    home_score: number;
    away_score: number;
    summary_done: number;
    match_id: string;
  }>(
    `SELECT p.id, p.market, p.selection, m.home_score, m.away_score, m.summary_done, m.id AS match_id
     FROM proposals p JOIN matches m ON m.id = p.match_id
     WHERE p.outcome = 'pending' AND m.status = 'finita' AND m.home_score IS NOT NULL`,
  );
  for (const proposal of pending) {
    const outcome = judge(proposal);
    if (!outcome) continue;
    run(
      "UPDATE proposals SET outcome = ?, outcome_note = ?, settled_at = ? WHERE id = ?",
      outcome.outcome,
      outcome.note,
      new Date().toISOString(),
      proposal.id,
    );
  }
}

function judge(proposal: {
  market: string;
  selection: string;
  home_score: number;
  away_score: number;
  summary_done: number;
  match_id: string;
}): { outcome: "hit" | "miss" | "non_verificabile"; note: string } | null {
  const home = proposal.home_score;
  const away = proposal.away_score;
  const result = home > away ? "1" : home === away ? "X" : "2";
  if (proposal.market === "segno") {
    const side = proposal.selection.startsWith("1 —") ? "1" : proposal.selection.startsWith("X —") ? "X" : proposal.selection.startsWith("2 —") ? "2" : "";
    if (!side) return { outcome: "non_verificabile", note: "Segno illeggibile" };
    return { outcome: side === result ? "hit" : "miss", note: `Risultato ${home}-${away}` };
  }
  if (proposal.market === "under_over") {
    const line = proposal.selection.match(/(\d+),(\d)/);
    if (!line) return { outcome: "non_verificabile", note: "Linea illeggibile" };
    const threshold = Number(`${line[1]}.${line[2]}`);
    const goals = home + away;
    const hit = proposal.selection.startsWith("Over") ? goals > threshold : goals < threshold;
    return { outcome: hit ? "hit" : "miss", note: `Gol totali ${goals}` };
  }
  if (proposal.market === "gol") {
    const both = home > 0 && away > 0;
    const hit = proposal.selection.startsWith("No gol") ? !both : proposal.selection.startsWith("Gol") ? both : null;
    if (hit == null) return { outcome: "non_verificabile", note: "Gol/no gol illeggibile" };
    return { outcome: hit ? "hit" : "miss", note: `Risultato ${home}-${away}` };
  }
  if (proposal.market === "doppia_chance") {
    const hit =
      (proposal.selection.startsWith("1X") && result !== "2") ||
      (proposal.selection.startsWith("X2") && result !== "1") ||
      (proposal.selection.startsWith("12") && result !== "X");
    return { outcome: hit ? "hit" : "miss", note: `Risultato ${home}-${away}` };
  }
  if (proposal.market === "combo") {
    const hit = comboHits(proposal.selection, home, away);
    if (hit == null) return { outcome: "non_verificabile", note: "Doppia illeggibile" };
    return { outcome: hit ? "hit" : "miss", note: `Risultato ${home}-${away}` };
  }
  if (proposal.market === "multigol") {
    const band = proposal.selection.match(/(\d)-(\d)/);
    if (!band) return { outcome: "non_verificabile", note: "Fascia illeggibile" };
    const total = home + away;
    const hit = total >= Number(band[1]) && total <= Number(band[2]);
    return { outcome: hit ? "hit" : "miss", note: `Gol totali ${total}` };
  }
  if (!proposal.summary_done) return null;
  if (proposal.market === "marcatore") {
    const name = proposal.selection.split(":").slice(1).join(":").trim();
    const surname = lastName(name);
    const goals = all<{ player_name: string }>("SELECT player_name FROM match_goals WHERE match_id = ?", proposal.match_id);
    if (!goals.length && home + away > 0) return { outcome: "non_verificabile", note: "Marcatori del tabellino assenti" };
    const hit = surname ? goals.some((goal) => mentionsAlias(goal.player_name, surname)) : false;
    return { outcome: hit ? "hit" : "miss", note: hit ? "A segno" : "Non a segno" };
  }
  if (proposal.selection.startsWith("Over")) {
    const cards = all<{ yellows: number; reds: number }>("SELECT yellows, reds FROM match_cards WHERE match_id = ?", proposal.match_id);
    if (cards.length < 2) return { outcome: "non_verificabile", note: "Cartellini di squadra assenti" };
    const total = cards.reduce((sum, row) => sum + row.yellows + 2 * row.reds, 0);
    return { outcome: total > 3.5 ? "hit" : "miss", note: `Cartellini ${total}` };
  }
  if (proposal.selection.startsWith("Ammonito:")) {
    const name = proposal.selection.split(":").slice(1).join(":").trim();
    const surname = lastName(name);
    const cards = all<{ player_name: string }>("SELECT player_name FROM player_cards WHERE match_id = ?", proposal.match_id);
    if (!surname) return { outcome: "non_verificabile", note: "Nome non confrontabile" };
    if (!cards.length) return { outcome: "non_verificabile", note: "Ammoniti del tabellino assenti" };
    const hit = cards.some((card) => mentionsAlias(card.player_name, surname));
    return { outcome: hit ? "hit" : "miss", note: hit ? "Ammonito" : "Non ammonito" };
  }
  return { outcome: "non_verificabile", note: "Mercato non regolato" };
}

export async function refresh(mode: Mode) {
  console.log(`[margine] aggiornamento ${mode}`);
  try {
    if (mode === "startup" || mode === "news") {
      try {
        const notes = await probeQuoteSources();
        saveSource({ odds: notes });
      } catch (error) {
        console.error("[margine] quote", error instanceof Error ? error.message : error);
        saveSource({ odds: cachedQuoteNotes() });
      }
    }
    if (mode === "startup" || mode === "news") {
      saveSource({ phase: "Lettura calendario" });
      await syncFixtures();
    }
    if ((get<{ n: number }>("SELECT COUNT(*) AS n FROM matches")?.n ?? 0) === 0 && mode === "startup") {
      storeMatches(sampleMatches(), "sample");
      metaSet("data_origin", "sample");
      if (!metaGet("first_run_at")) metaSet("first_run_at", new Date().toISOString());
      saveSource({ sample: true, fixtures: "sample", matchCount: sampleMatches().length, phase: "Dati di esempio" });
    }
    if (mode === "startup" || mode === "rosters") {
      saveSource({ phase: "Rose e indisponibili" });
      await syncRosters();
    }
    if (mode === "startup" || mode === "news") {
      saveSource({ phase: "Notizie" });
      await syncNews();
    }
    if (mode !== "rosters") {
      saveSource({ phase: "Tabellini e formazioni" });
      await syncSummaries(mode);
    }
    saveSource({ phase: "Quote Betflag" });
    if ((get<{ n: number }>("SELECT COUNT(*) AS n FROM matches")?.n ?? 0) > 0) await syncBetflag();
    saveSource({ phase: "Proposte" });
    recompute();
    settle();
    const days = all<{ matchday: number; n: number }>(
      "SELECT matchday, COUNT(*) AS n FROM matches GROUP BY matchday ORDER BY matchday",
    );
    console.log(`[margine] giornate ${days.map((day) => `${day.matchday}:${day.n}`).join(" ")}`);
    saveSource({
      phase: "pronto",
      matchCount: get<{ n: number }>("SELECT COUNT(*) AS n FROM matches")?.n ?? 0,
      error: readSource().sample ? readSource().error : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "errore aggiornamento";
    console.error("[margine]", message);
    saveSource({ error: message, phase: "errore" });
  }
}

async function pump() {
  const loop = loopState();
  if (loop.running) return;
  loop.running = true;
  try {
    while (loop.pending.size) {
      const modes = [...loop.pending];
      loop.pending.clear();
      const mode: Mode = modes.includes("startup")
        ? "startup"
        : modes.includes("rosters")
          ? "rosters"
          : modes.includes("news")
            ? "news"
            : "lineups";
      await refresh(mode);
    }
  } finally {
    loop.running = false;
    if (loop.pending.size) void pump();
  }
}

const vercelGlobal = globalThis as unknown as { __margineVercelChain?: Promise<void> };

function onVercel(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

function vercelRefresh(mode: Mode): Promise<void> {
  const next = (vercelGlobal.__margineVercelChain ?? Promise.resolve()).then(() => refresh(mode));
  vercelGlobal.__margineVercelChain = next.catch((error) => {
    console.error("[margine]", error instanceof Error ? error.message : error);
  });
  return vercelGlobal.__margineVercelChain;
}

export function startRefreshLoop() {
  const loop = loopState();
  if (loop.started) return;
  loop.started = true;
  if (onVercel()) {
    void vercelRefresh("startup");
    return;
  }
  loop.pending.add("startup");
  void pump();
  setInterval(() => {
    loop.pending.add("news");
    void pump();
  }, 3 * 60 * 1000);
  setInterval(() => {
    loop.pending.add("lineups");
    void pump();
  }, 60 * 1000);
  setInterval(() => {
    loop.pending.add("rosters");
    void pump();
  }, 15 * 60 * 1000);
}

/** On Vercel the sqlite file is empty after every new instance, so the first request waits for a live refresh. */
export async function ensureData(): Promise<void> {
  if (!onVercel()) return;
  const count = () => get<{ n: number }>("SELECT COUNT(*) AS n FROM matches")?.n ?? 0;
  if (count() === 0) {
    if (!vercelGlobal.__margineVercelChain) {
      loopState().started = true;
      await vercelRefresh("startup");
    } else {
      await vercelGlobal.__margineVercelChain;
    }
    if (count() === 0) await vercelRefresh("startup");
    return;
  }
  const updated = readSource().updatedAt;
  const stale = !updated || Date.now() - Date.parse(updated) > 3 * 60 * 1000;
  if (!stale) return;
  const { after } = await import("next/server");
  after(() => vercelRefresh("news"));
}
