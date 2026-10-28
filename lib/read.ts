import { all, get, metaGet } from "./db";
import { focusMatchdays, romeDay } from "./matchday";
import { DATO_ASSENTE, MARKET_LABEL, OUTCOME_LABEL } from "./thresholds";
import { formatKick, formatNum, formatPct, orDato } from "./format";
import { RULES } from "./rules";
import type { SourceState } from "./types";
import type { GiornataPayload, MatchPayload, MatchRowView, PickView, SignalChip, StoricoPayload } from "./view";

type MatchRow = {
  id: string;
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
};

type ProposalRow = {
  id: string;
  match_id: string;
  market: string;
  selection: string;
  confidence: "alta" | "media";
  sicura: number;
  probability: number | null;
  sort_key: number;
  reason: string;
  safety_note: string;
  signals_json: string;
  form_home: string;
  form_away: string;
  origin: string;
  outcome: string;
  home_name: string;
  away_name: string;
  kickoff: string;
  matchday: number | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
};

type Played = {
  id: string;
  kickoff: string;
  home_id: string;
  away_id: string;
  home_score: number;
  away_score: number;
};

const SIGNAL_LABEL: Record<string, string> = {
  classifica: "Classifica",
  forma: "Forma",
  gol: "Gol",
  crisi: "Crisi",
  probabilita: "Stima",
  fascia: "Fascia",
  margine: "Margine",
  spaccato: "Casa/trasferta",
  titolare: "Titolare",
  minuti: "Minuti",
  rigori: "Rigori",
  squadre: "Squadre",
  arbitro: "Arbitro",
  gialli: "Gialli",
  falli: "Falli",
};

function source(): SourceState {
  const raw = metaGet("source");
  if (!raw) {
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
      updatedAt: null,
      matchCount: 0,
      phase: "in attesa",
      error: null,
    };
  }
  return JSON.parse(raw) as SourceState;
}

function banner(state: SourceState): string {
  if (state.sample) {
    return "Dati di esempio. Le fonti live non hanno risposto: risultati e proposte non sono reali.";
  }
  if (state.fixtures === "espn") return "Serie A 2026/27 letta da ESPN, endpoint pubblico. Non è un confronto quote.";
  if (state.fixtures === "football-data") return "Calendario letto da football-data.org. Non è un confronto quote.";
  return "In attesa delle partite.";
}

function sourceNotes(state: SourceState): string[] {
  const news = Object.entries(state.news).map(([name, info]) => {
    const label = name === "gazzetta" ? "Gazzetta" : name === "sky" ? "Sky Sport" : name === "corriere" ? "Corriere dello Sport" : "Tuttosport";
    return `${label}: ${info.status}${info.newest ? ` (ultimo ${formatKick(info.newest)})` : ""}`;
  });
  return [
    `football-data.org: HTTP ${state.footballDataHttp ?? DATO_ASSENTE}. ${state.footballDataNote}`,
    `Partite: ${state.fixtures === "espn" ? "ESPN" : state.fixtures === "football-data" ? "football-data.org" : state.fixtures === "sample" ? "esempio" : DATO_ASSENTE}.`,
    `Formazioni: ${state.lineups}. Arbitro: ${state.referee}. Minuti: ${state.minutes}. Indisponibili: ${state.injuries}.`,
    ...news,
  ];
}

function scoreLabel(status: string, home: number | null, away: number | null): string | null {
  if ((status !== "finita" && status !== "in corso") || home == null || away == null) return null;
  return `${home}–${away}`;
}

function signalsOf(raw: string): SignalChip[] {
  try {
    const parsed = JSON.parse(raw) as Record<string, string | number | boolean | null>;
    return Object.entries(parsed).map(([key, value]) => ({
      label: SIGNAL_LABEL[key] ?? key,
      value: value == null ? DATO_ASSENTE : String(value),
    }));
  } catch {
    return [];
  }
}

function toPick(row: ProposalRow): PickView {
  return {
    id: row.id,
    matchId: row.match_id,
    market: row.market,
    marketLabel: MARKET_LABEL[row.market] ?? row.market,
    selection: row.selection,
    confidence: row.confidence,
    sicura: row.sicura === 1,
    probability: row.probability,
    probabilityLabel: row.probability == null ? DATO_ASSENTE : formatPct(row.probability),
    reason: row.reason,
    safetyNote: row.safety_note,
    formHome: row.form_home,
    formAway: row.form_away,
    homeName: row.home_name,
    awayName: row.away_name,
    kickoffLabel: formatKick(row.kickoff),
    matchday: row.matchday,
    status: row.status,
    scoreLabel: scoreLabel(row.status, row.home_score, row.away_score),
    signals: signalsOf(row.signals_json),
    outcome: row.outcome,
    outcomeLabel: OUTCOME_LABEL[row.outcome] ?? row.outcome,
    originLabel: row.origin === "ricostruzione" ? "ricostruita" : "registrata dal sito",
  };
}

const PICK_SQL = `
  SELECT p.*, m.home_name, m.away_name, m.kickoff, m.matchday, m.status, m.home_score, m.away_score
  FROM proposals p JOIN matches m ON m.id = p.match_id
`;

function standingsMap() {
  const rows = all<{ team_id: string; rank: number; won: number; drawn: number; lost: number; played: number }>(
    "SELECT team_id, rank, won, drawn, lost, played FROM standings",
  );
  return new Map(rows.map((row) => [row.team_id, row]));
}

function rankLabel(table: ReturnType<typeof standingsMap>, teamId: string): string {
  const row = table.get(teamId);
  return row ? `${row.rank}ª` : DATO_ASSENTE;
}

function recordLabel(table: ReturnType<typeof standingsMap>, teamId: string): string {
  const row = table.get(teamId);
  return row ? `${row.won}-${row.drawn}-${row.lost}` : DATO_ASSENTE;
}

function openMatchdays(): { current: number | null; next: number | null } {
  const rows = all<{ matchday: number; status: string; kickoff: string }>(
    "SELECT matchday, status, kickoff FROM matches WHERE matchday IS NOT NULL ORDER BY kickoff",
  );
  return focusMatchdays(rows);
}

function busted(row: ProposalRow): boolean {
  if (row.market !== "multigol" || row.status !== "in corso" || row.home_score == null || row.away_score == null) return false;
  const band = row.selection.match(/(\d)-(\d)/);
  if (!band) return false;
  return row.home_score + row.away_score > Number(band[2]);
}

export function readGiornata(): GiornataPayload {
  const state = source();
  const matches = all<MatchRow>("SELECT * FROM matches ORDER BY kickoff");
  const { current, next } = openMatchdays();
  const today = romeDay(new Date().toISOString());
  const span = get<{ n: number; first: string | null; last: string | null; future: number }>(
    `SELECT COUNT(DISTINCT matchday) AS n,
            MIN(kickoff) AS first,
            MAX(kickoff) AS last,
            SUM(CASE WHEN kickoff > ? AND status != 'finita' AND status != 'rinviata' THEN 1 ELSE 0 END) AS future
     FROM matches`,
    new Date().toISOString(),
  );
  const seasonLabel = span?.n && span.first && span.last
    ? `Stagione intera: ${span.n} giornate, dal ${formatKick(span.first)} al ${formatKick(span.last)}. ${
        span.future > 0
          ? "Le giornate non ancora giocate sono in archivio e il sito le tiene aggiornate."
          : "In archivio non risultano partite future."
      } Qui in pagina ci sono solo la giornata di oggi e la successiva.`
    : "Calendario ancora incompleto.";
  const table = standingsMap();
  const picks = all<ProposalRow>(`${PICK_SQL} WHERE p.origin = 'live'`).map(toPick);
  const altaByMatch = new Map<string, number>();
  for (const pick of picks) {
    if (pick.confidence === "alta") altaByMatch.set(pick.matchId, (altaByMatch.get(pick.matchId) ?? 0) + 1);
  }
  const focus = [current, next].filter((day): day is number => day != null);
  const matchdays = focus.map((day) => {
    const role = day === current ? "corrente" : "prossima";
    const rows = matches.filter((match) => match.matchday === day);
    return {
      number: day,
      role,
      title: `Giornata ${day}`,
      matches: rows.map((match): MatchRowView => ({
        id: match.id,
        kickoffLabel: formatKick(match.kickoff),
        status: match.status,
        minute: match.minute,
        homeName: match.home_name,
        awayName: match.away_name,
        homeRank: rankLabel(table, match.home_id),
        awayRank: rankLabel(table, match.away_id),
        homeRecord: recordLabel(table, match.home_id),
        awayRecord: recordLabel(table, match.away_id),
        scoreLabel: scoreLabel(match.status, match.home_score, match.away_score),
        venue: orDato(match.venue),
        altaCount: altaByMatch.get(match.id) ?? 0,
      })),
    };
  });
  const liveRows = all<ProposalRow>(
    `${PICK_SQL} WHERE p.origin = 'live' AND m.status != 'finita' AND m.status != 'rinviata'`,
  )
    .filter((row) => !busted(row) && (row.matchday === current || row.matchday === next))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || b.sort_key - a.sort_key);
  const slips = focus.map((day) => {
    const tonight = matches.some(
      (match) =>
        match.matchday === day &&
        romeDay(match.kickoff) === today &&
        match.status !== "finita" &&
        match.status !== "rinviata",
    );
    return {
      matchday: day,
      role: day === current ? "corrente" : "prossima",
      title: day === current
        ? `Giornata ${day}${tonight ? " · stasera compresa" : ""}`
        : `Giornata ${day} · la prossima`,
      note: day === current
        ? "È la giornata di oggi: le partite già chiuse restano in elenco, quelle di stasera sono ancora da giocare."
        : "È la giornata successiva, non l’ultima della stagione.",
      picks: liveRows.filter((row) => row.matchday === day).map(toPick),
    };
  });
  return {
    ready: matches.length > 0,
    phase: state.phase,
    updatedLabel: state.updatedAt ? formatKick(state.updatedAt) : DATO_ASSENTE,
    sample: state.sample,
    banner: banner(state),
    sourceNotes: sourceNotes(state),
    seasonLabel,
    slips,
    matchdays,
    rules: RULES,
  };
}

function priorOf(teamId: string, kickoff: string): Played[] {
  return all<Played>(
    `SELECT id, kickoff, home_id, away_id, home_score, away_score FROM matches
     WHERE status = 'finita' AND home_score IS NOT NULL AND kickoff < ? AND (home_id = ? OR away_id = ?)
     ORDER BY kickoff`,
    kickoff,
    teamId,
    teamId,
  );
}

function letters(matches: Played[], teamId: string): string {
  if (!matches.length) return DATO_ASSENTE;
  return matches
    .slice(-5)
    .map((match) => {
      const home = match.home_id === teamId;
      const gf = home ? match.home_score : match.away_score;
      const ga = home ? match.away_score : match.home_score;
      if (gf > ga) return "V";
      if (gf === ga) return "N";
      return "P";
    })
    .join(" ");
}

function goals(matches: Played[], teamId: string): { gf: number; ga: number; clean: number } | null {
  if (!matches.length) return null;
  let gf = 0;
  let ga = 0;
  let clean = 0;
  for (const match of matches) {
    const home = match.home_id === teamId;
    const scored = home ? match.home_score : match.away_score;
    const conceded = home ? match.away_score : match.home_score;
    gf += scored;
    ga += conceded;
    if (conceded === 0) clean += 1;
  }
  return { gf, ga, clean };
}

function cardLine(teamId: string, kickoff: string, played: number | null): string {
  const recent = all<{ yellows: number; reds: number }>(
    `SELECT c.yellows, c.reds FROM match_cards c JOIN matches m ON m.id = c.match_id
     WHERE c.team_id = ? AND m.kickoff < ? AND m.status = 'finita'
     ORDER BY m.kickoff DESC LIMIT 5`,
    teamId,
    kickoff,
  );
  if (recent.length >= 3) {
    const avg = recent.reduce((sum, row) => sum + row.yellows + 2 * row.reds, 0) / recent.length;
    return `${formatNum(avg)} a partita, ultime ${recent.length}`;
  }
  const season = get<{ cards: number }>(
    "SELECT COALESCE(SUM(yellows + 2 * reds), 0) AS cards FROM players WHERE team_id = ?",
    teamId,
  );
  if (season && played && played >= 4) return `${formatNum(season.cards / played)} a partita, stagione`;
  return DATO_ASSENTE;
}

export function readPartita(id: string): MatchPayload {
  const state = source();
  const match = get<MatchRow>("SELECT * FROM matches WHERE id = ?", id);
  const base = {
    ready: (get<{ n: number }>("SELECT COUNT(*) AS n FROM matches")?.n ?? 0) > 0,
    sample: state.sample,
    banner: banner(state),
    updatedLabel: state.updatedAt ? formatKick(state.updatedAt) : DATO_ASSENTE,
  };
  if (!match) return { ...base, found: false, match: null, form: [], trends: [], injuries: [], injuryNote: DATO_ASSENTE, news: [], newsNote: DATO_ASSENTE, markets: [], suppressed: [] };
  const table = standingsMap();
  const homePrior = priorOf(match.home_id, match.kickoff);
  const awayPrior = priorOf(match.away_id, match.kickoff);
  const homeVenue = homePrior.filter((item) => item.home_id === match.home_id);
  const awayVenue = awayPrior.filter((item) => item.away_id === match.away_id);
  const homeLast = goals(homePrior.slice(-5), match.home_id);
  const awayLast = goals(awayPrior.slice(-5), match.away_id);
  const homeSeason = goals(homePrior, match.home_id);
  const awaySeason = goals(awayPrior, match.away_id);
  const assessment = get<{ notes_json: string; suppressed_json: string; expected_home: number | null; expected_away: number | null }>(
    "SELECT notes_json, suppressed_json, expected_home, expected_away FROM assessments WHERE match_id = ?",
    id,
  );
  const notes: string[] = assessment ? (JSON.parse(assessment.notes_json) as string[]) : [];
  const suppressed: string[] = assessment ? (JSON.parse(assessment.suppressed_json) as string[]) : [];
  const picks = all<ProposalRow>(`${PICK_SQL} WHERE p.match_id = ? ORDER BY p.sort_key DESC`, id).map(toPick);
  const blocks = [
    ["doppia_chance", "Doppia chance"],
    ["multigol", "Multigol"],
    ["combo", "Doppia"],
    ["marcatore", "Marcatore"],
    ["ammonizioni", "Ammonizioni"],
  ].map(([market, label]) => ({
    id: market,
    label,
    picks: picks.filter((pick) => pick.market === market),
    note: notes.filter((note) => note.toLowerCase().includes(label.toLowerCase().slice(0, 6)) || note.toLowerCase().includes(market.replace("_", " "))).join(" "),
  }));
  const injuryRows = all<{ team_id: string; player_name: string; detail: string }>(
    "SELECT team_id, player_name, detail FROM injuries WHERE team_id IN (?, ?)",
    match.home_id,
    match.away_id,
  );
  const injuries = [match.home_id, match.away_id].map((teamId) => ({
    team: teamId === match.home_id ? match.home_name : match.away_name,
    lines: injuryRows.filter((row) => row.team_id === teamId).map((row) => `${row.player_name}: ${row.detail}`),
  }));
  const news = all<{ title: string; source: string; published_at: string; link: string; summary: string }>(
    `SELECT DISTINCT n.title, n.source, n.published_at, n.link, n.summary
     FROM news n JOIN news_teams nt ON nt.news_id = n.id
     WHERE nt.team_id IN (?, ?) AND n.published_at > ?
     ORDER BY n.published_at DESC LIMIT 8`,
    match.home_id,
    match.away_id,
    new Date(Date.now() - 7 * 86_400_000).toISOString(),
  );
  const newsFailed = Object.values(state.news).every((item) => item.status !== "ok");
  const playedHome = table.get(match.home_id)?.played ?? null;
  const playedAway = table.get(match.away_id)?.played ?? null;
  const perGame = (stat: { gf: number; ga: number; clean: number } | null, sample: Played[], side: "gf" | "ga" | "clean") => {
    if (!stat || !sample.length) return DATO_ASSENTE;
    if (side === "clean") return `${stat.clean} su ${sample.length}`;
    return formatNum(stat[side] / sample.length);
  };
  return {
    ...base,
    found: true,
    match: {
      id: match.id,
      matchday: match.matchday,
      kickoffLabel: formatKick(match.kickoff),
      status: match.status,
      minute: match.minute,
      venue: orDato(match.venue),
      referee: orDato(match.referee),
      homeName: match.home_name,
      awayName: match.away_name,
      homeRank: rankLabel(table, match.home_id),
      awayRank: rankLabel(table, match.away_id),
      homeRecord: recordLabel(table, match.home_id),
      awayRecord: recordLabel(table, match.away_id),
      scoreLabel: scoreLabel(match.status, match.home_score, match.away_score),
      expected:
        assessment?.expected_home == null || assessment.expected_away == null
          ? DATO_ASSENTE
          : `${formatNum(assessment.expected_home)}–${formatNum(assessment.expected_away)}`,
    },
    form: [
      { label: "Ultime 5", home: letters(homePrior, match.home_id), away: letters(awayPrior, match.away_id) },
      { label: "Nel ruolo", home: letters(homeVenue, match.home_id), away: letters(awayVenue, match.away_id) },
    ],
    trends: [
      { label: "Gol fatti, ultime 5", home: perGame(homeLast, homePrior.slice(-5), "gf"), away: perGame(awayLast, awayPrior.slice(-5), "gf") },
      { label: "Gol subiti, ultime 5", home: perGame(homeLast, homePrior.slice(-5), "ga"), away: perGame(awayLast, awayPrior.slice(-5), "ga") },
      { label: "Clean sheet recenti", home: perGame(homeLast, homePrior.slice(-5), "clean"), away: perGame(awayLast, awayPrior.slice(-5), "clean") },
      { label: "Clean sheet in stagione", home: homeSeason ? `${homeSeason.clean} su ${homePrior.length}` : DATO_ASSENTE, away: awaySeason ? `${awaySeason.clean} su ${awayPrior.length}` : DATO_ASSENTE },
      { label: "Cartellini", home: cardLine(match.home_id, match.kickoff, playedHome), away: cardLine(match.away_id, match.kickoff, playedAway) },
    ],
    injuries,
    injuryNote:
      state.injuries === "dato assente" && injuryRows.length === 0
        ? DATO_ASSENTE
        : injuryRows.length === 0
          ? "Nessun indisponibile segnalato dalla fonte."
          : "",
    news: news.map((item) => ({
      title: item.title,
      source: item.source,
      time: formatKick(item.published_at),
      link: item.link,
      summary: item.summary,
    })),
    newsNote: news.length ? "" : newsFailed ? DATO_ASSENTE : "Nessun articolo recente nomina queste squadre.",
    markets: blocks,
    suppressed,
  };
}

export function readStorico(): StoricoPayload {
  const state = source();
  const rows = all<ProposalRow>(`${PICK_SQL} ORDER BY m.kickoff DESC, p.sort_key DESC`).map(toPick);
  const markets = ["doppia_chance", "multigol", "combo", "marcatore", "ammonizioni"];
  const rates = markets.map((market) => {
    const mine = rows.filter((row) => row.market === market);
    const hits = mine.filter((row) => row.outcome === "hit").length;
    const misses = mine.filter((row) => row.outcome === "miss").length;
    const pending = mine.filter((row) => row.outcome === "pending").length;
    const unverified = mine.filter((row) => row.outcome === "non_verificabile").length;
    return {
      market,
      label: MARKET_LABEL[market] ?? market,
      hits,
      misses,
      pending,
      unverified,
      rateLabel: hits + misses === 0 ? DATO_ASSENTE : formatPct(hits / (hits + misses)),
    };
  });
  return {
    ready: rows.length > 0 || (get<{ n: number }>("SELECT COUNT(*) AS n FROM matches")?.n ?? 0) > 0,
    sample: state.sample,
    banner: banner(state),
    updatedLabel: state.updatedAt ? formatKick(state.updatedAt) : DATO_ASSENTE,
    note: "Le doppie chance e i multigol delle giornate già giocate sono ricostruiti solo con i risultati precedenti alla partita. Marcatori e ammonizioni compaiono quando il sito li registra, senza usare numeri futuri. Il tasso non è un utile promesso.",
    rates,
    rows,
  };
}

export function readStato(): SourceState {
  return source();
}
