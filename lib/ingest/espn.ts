import { americanToDecimal } from "../method";
import type { BookPrice, MatchStatus } from "../types";
import { italianName } from "../teams";

export type ParsedMatch = {
  id: string;
  kickoff: string;
  status: MatchStatus;
  minute: string | null;
  homeId: string;
  homeName: string;
  awayId: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  referee: string | null;
};

export type ParsedStanding = {
  teamId: string;
  name: string;
  rawName: string;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
};

export type ParsedPlayer = {
  playerId: string;
  teamId: string;
  name: string;
  position: string | null;
  appearances: number | null;
  subIns: number | null;
  goals: number | null;
  yellows: number | null;
  reds: number | null;
  fouls: number | null;
};

export type ParsedInjury = { teamId: string; playerName: string; detail: string };

export type ParsedSummary = {
  lineups: { teamId: string; playerId: string; name: string; position: string | null; starter: boolean }[];
  cards: { teamId: string; yellows: number; reds: number; fouls: number | null }[];
  goals: { playerId: string; playerName: string; teamId: string | null; minute: string; penalty: boolean }[];
  playerCards: { playerId: string; playerName: string; teamId: string | null; red: boolean }[];
  referee: string | null;
};

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function interpretStatus(name: string, state: string): MatchStatus {
  const label = name.toUpperCase();
  if (label.includes("POSTPON") || label.includes("CANCEL") || label.includes("SUSPEND")) return "rinviata";
  if (state === "in" || label.includes("IN_PROGRESS") || label.includes("HALFTIME")) return "in corso";
  if (state === "post" || label.includes("FULL_TIME") || label.includes("FINAL")) return "finita";
  return "non iniziata";
}

function readStatus(node: Rec | null): { status: MatchStatus; minute: string | null } {
  const type = rec(node?.type);
  const name = str(type?.name) ?? "";
  const state = str(type?.state) ?? "";
  const minute = str(node?.displayClock);
  return { status: interpretStatus(name, state), minute: minute && minute !== "0'" ? minute : null };
}

function readScore(value: unknown, status: MatchStatus): number | null {
  if (status === "non iniziata" || status === "rinviata") return null;
  if (typeof value === "string" || typeof value === "number") return num(value);
  const object = rec(value);
  if (!object) return null;
  return num(object.displayValue ?? object.value);
}

export function parseEvent(event: unknown): ParsedMatch | null {
  const node = rec(event);
  if (!node) return null;
  const competition = rec(arr(node.competitions)[0]) ?? node;
  const status = readStatus(rec(node.status) ?? rec(competition.status));
  const competitors = arr(competition.competitors).map(rec).filter((item): item is Rec => item != null);
  const home = competitors.find((item) => item.homeAway === "home");
  const away = competitors.find((item) => item.homeAway === "away");
  const homeTeam = rec(home?.team);
  const awayTeam = rec(away?.team);
  const id = str(node.id) ?? str(competition.id);
  const kickoff = str(node.date) ?? str(competition.date);
  const homeId = str(homeTeam?.id);
  const awayId = str(awayTeam?.id);
  const homeRaw = str(homeTeam?.displayName) ?? str(homeTeam?.name);
  const awayRaw = str(awayTeam?.displayName) ?? str(awayTeam?.name);
  if (!id || !kickoff || !home || !away || !homeId || !awayId || !homeRaw || !awayRaw) return null;
  const venueNode = rec(competition.venue) ?? rec(node.venue);
  const officials = [
    ...arr(competition.officials),
    ...arr(rec(node.gameInfo)?.officials),
  ].map(rec);
  const referee = officials
    .map((official) => str(official?.displayName) ?? str(official?.fullName) ?? str(rec(official?.athlete)?.displayName))
    .find((name): name is string => Boolean(name)) ?? null;
  return {
    id,
    kickoff,
    status: status.status,
    minute: status.status === "in corso" ? status.minute : null,
    homeId,
    homeName: italianName(homeRaw),
    awayId,
    awayName: italianName(awayRaw),
    homeScore: readScore(home.score, status.status),
    awayScore: readScore(away.score, status.status),
    venue: str(venueNode?.fullName) ?? str(venueNode?.displayName),
    referee,
  };
}

function americanPrice(value: unknown): number | null {
  return americanToDecimal(value);
}

function priceNode(node: unknown): number | null {
  const object = rec(node);
  if (!object) return americanPrice(node);
  const close = rec(object.close);
  const open = rec(object.open);
  return americanPrice(close?.odds ?? open?.odds ?? object.odds ?? object.moneyLine);
}

function totalLine(node: unknown, fallback: number | null): number | null {
  if (typeof node === "number" && Number.isFinite(node)) return node;
  if (typeof node === "string") {
    const match = node.match(/(\d+(?:[.,]\d+)?)/);
    if (match) return Number(match[1].replace(",", "."));
  }
  return fallback;
}

/** Quote DraftKings (o altro provider) già dentro il tabellone ESPN. Nessun numero viene riempito se il campo manca. */
export function parseBookOdds(payload: unknown, readAt = new Date().toISOString()): BookPrice[] {
  const root = rec(payload);
  const rows: BookPrice[] = [];
  for (const event of arr(root?.events)) {
    const node = rec(event);
    const competition = rec(arr(node?.competitions)[0]);
    const id = str(node?.id) ?? str(competition?.id);
    const odds = rec(arr(competition?.odds)[0]);
    if (!id || !odds) continue;
    const provider = rec(odds.provider);
    const moneyline = rec(odds.moneyline);
    const total = rec(odds.total);
    const home = priceNode(moneyline?.home);
    const away = priceNode(moneyline?.away);
    const draw = priceNode(moneyline?.draw) ?? americanPrice(rec(odds.drawOdds)?.moneyLine);
    const overClose = rec(rec(total?.over)?.close);
    const line = totalLine(overClose?.line, num(odds.overUnder));
    const over = priceNode(total?.over);
    const under = priceNode(total?.under);
    if (home == null && draw == null && away == null && over == null && under == null) continue;
    rows.push({
      matchId: id,
      bookmaker: str(provider?.displayName) ?? str(provider?.name) ?? "ESPN",
      source: "ESPN scoreboard",
      readAt,
      home,
      draw,
      away,
      totalLine: line,
      over,
      under,
    });
  }
  return rows;
}

export function parseScoreboard(payload: unknown): { matches: ParsedMatch[]; dates: string[] } {
  const root = rec(payload);
  const league = rec(arr(root?.leagues)[0]);
  const dates = arr(league?.calendar)
    .map((value) => (typeof value === "string" ? value.slice(0, 10).replace(/-/g, "") : ""))
    .filter(Boolean);
  const matches = arr(root?.events)
    .map(parseEvent)
    .filter((match): match is ParsedMatch => match != null);
  return { matches, dates };
}

function statMap(entry: Rec): Map<string, number> {
  const map = new Map<string, number>();
  const categories = arr(rec(rec(entry.statistics)?.splits)?.categories);
  for (const category of categories) {
    for (const stat of arr(rec(category)?.stats)) {
      const node = rec(stat);
      const name = str(node?.name);
      const value = num(node?.value);
      if (name && value != null) map.set(name, value);
    }
  }
  return map;
}

function flattenAthletes(value: unknown): Rec[] {
  const out: Rec[] = [];
  for (const item of arr(value).map(rec)) {
    if (!item) continue;
    if (str(item.id) && str(item.displayName)) out.push(item);
    else out.push(...flattenAthletes(item.items ?? item.athletes));
  }
  return out;
}

export function parseRoster(payload: unknown, teamId: string): { players: ParsedPlayer[]; injuries: ParsedInjury[] } {
  const root = rec(payload);
  const players: ParsedPlayer[] = [];
  const injuries: ParsedInjury[] = [];
  for (const athlete of flattenAthletes(root?.athletes)) {
    const playerId = str(athlete.id);
    const name = str(athlete.displayName);
    if (!playerId || !name) continue;
    const stats = statMap(athlete);
    const position = str(rec(athlete.position)?.abbreviation) ?? str(rec(athlete.position)?.displayName);
    players.push({
      playerId,
      teamId,
      name,
      position,
      appearances: stats.has("appearances") ? stats.get("appearances")! : null,
      subIns: stats.has("subIns") ? stats.get("subIns")! : null,
      goals: stats.has("totalGoals") ? stats.get("totalGoals")! : null,
      yellows: stats.has("yellowCards") ? stats.get("yellowCards")! : null,
      reds: stats.has("redCards") ? stats.get("redCards")! : null,
      fouls: stats.has("foulsCommitted") ? stats.get("foulsCommitted")! : null,
    });
    for (const injury of arr(athlete.injuries).map(rec)) {
      if (!injury) continue;
      const detail =
        str(rec(injury.details)?.detail) ??
        str(rec(injury.details)?.fantasyStatus) ??
        str(rec(injury.type)?.description) ??
        str(injury.status) ??
        str(injury.longComment);
      if (!detail) continue;
      injuries.push({ teamId, playerName: name, detail });
    }
  }
  return { players, injuries };
}

function standingNumber(stats: Rec[], name: string): number | null {
  const found = stats.map(rec).find((stat) => stat?.name === name || stat?.abbreviation === name);
  return num(found?.value ?? found?.displayValue);
}

export function parseStandings(payload: unknown): ParsedStanding[] {
  const root = rec(payload);
  const child = arr(root?.children).map(rec).find((item) => arr(rec(item?.standings)?.entries).length);
  const entries = arr(rec(child?.standings)?.entries);
  const rows: ParsedStanding[] = [];
  for (const entry of entries.map(rec)) {
    if (!entry) continue;
    const team = rec(entry.team);
    const teamId = str(team?.id);
    const rawName = str(team?.displayName);
    if (!teamId || !rawName) continue;
    const stats = arr(entry.stats).map(rec).filter((item): item is Rec => item != null);
    const rank = standingNumber(stats, "rank");
    const played = standingNumber(stats, "gamesPlayed");
    const points = standingNumber(stats, "points");
    if (rank == null || played == null || points == null) continue;
    rows.push({
      teamId,
      name: italianName(rawName),
      rawName,
      rank,
      played,
      won: standingNumber(stats, "wins") ?? 0,
      drawn: standingNumber(stats, "ties") ?? 0,
      lost: standingNumber(stats, "losses") ?? 0,
      gf: standingNumber(stats, "pointsFor") ?? 0,
      ga: standingNumber(stats, "pointsAgainst") ?? 0,
      points,
    });
  }
  return rows;
}

export function parseSummary(payload: unknown): ParsedSummary {
  const root = rec(payload);
  const lineups: ParsedSummary["lineups"] = [];
  for (const roster of arr(root?.rosters).map(rec)) {
    if (!roster) continue;
    const teamId = str(rec(roster.team)?.id);
    if (!teamId) continue;
    for (const player of arr(roster.roster).map(rec)) {
      if (!player) continue;
      const athlete = rec(player.athlete);
      const playerId = str(athlete?.id);
      const name = str(athlete?.displayName);
      if (!playerId || !name) continue;
      lineups.push({
        teamId,
        playerId,
        name,
        position: str(rec(player.position)?.abbreviation),
        starter: player.starter === true,
      });
    }
  }
  const cards: ParsedSummary["cards"] = [];
  for (const team of arr(rec(root?.boxscore)?.teams).map(rec)) {
    if (!team) continue;
    const teamId = str(rec(team.team)?.id);
    if (!teamId) continue;
    const stats = new Map<string, number>();
    for (const stat of arr(team.statistics).map(rec)) {
      const name = str(stat?.name);
      const value = num(stat?.displayValue ?? stat?.value);
      if (name && value != null) stats.set(name, value);
    }
    if (!stats.has("yellowCards") && !stats.has("redCards")) continue;
    cards.push({
      teamId,
      yellows: stats.get("yellowCards") ?? 0,
      reds: stats.get("redCards") ?? 0,
      fouls: stats.has("foulsCommitted") ? stats.get("foulsCommitted")! : null,
    });
  }
  const goals: ParsedSummary["goals"] = [];
  const playerCards: ParsedSummary["playerCards"] = [];
  for (const event of arr(root?.keyEvents).map(rec)) {
    if (!event) continue;
    const type = str(rec(event.type)?.text) ?? "";
    const teamId = str(rec(event.team)?.id);
    const minute = str(rec(event.clock)?.displayValue) ?? "";
    const people = arr(event.participants).map(rec);
    const first = rec(people[0]?.athlete);
    const playerId = str(first?.id);
    const playerName = str(first?.displayName);
    if (!playerId || !playerName) continue;
    if (type === "Goal" || type === "Penalty - Scored") {
      goals.push({
        playerId,
        playerName,
        teamId,
        minute: minute || type,
        penalty: type === "Penalty - Scored",
      });
    }
    if (type === "Yellow Card" || type === "Red Card") {
      playerCards.push({ playerId, playerName, teamId, red: type === "Red Card" });
    }
  }
  const info = rec(root?.gameInfo);
  const headerComp = rec(arr(rec(root?.header)?.competitions)[0]);
  const official = [...arr(info?.officials), ...arr(headerComp?.officials)]
    .map(rec)
    .map((item) => str(item?.displayName) ?? str(item?.fullName))
    .find((name): name is string => Boolean(name));
  return { lineups, cards, goals, playerCards, referee: official ?? null };
}

export function ymd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
