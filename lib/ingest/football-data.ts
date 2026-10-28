import type { ParsedMatch } from "./espn";
import { interpretStatus } from "./espn";
import { fetchJson, fetchText } from "./http";
import { italianName } from "../teams";
import type { MatchStatus } from "../types";

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function footballDataStatus(status: string): MatchStatus {
  const value = status.toUpperCase();
  if (value === "IN_PLAY" || value === "PAUSED" || value === "EXTRA_TIME" || value === "PENALTY_SHOOTOUT") {
    return "in corso";
  }
  if (value === "FINISHED" || value === "AWARDED") return "finita";
  if (value === "POSTPONED" || value === "CANCELLED" || value === "SUSPENDED") return "rinviata";
  return interpretStatus(value, value === "FINISHED" ? "post" : "pre");
}

export function parseFootballDataMatches(payload: unknown): ParsedMatch[] {
  const matches = Array.isArray(rec(payload)?.matches) ? (rec(payload)?.matches as unknown[]) : [];
  const parsed: ParsedMatch[] = [];
  for (const item of matches) {
    const match = rec(item);
    if (!match) continue;
    const id = match.id;
    const kickoff = str(match.utcDate);
    const home = rec(match.homeTeam);
    const away = rec(match.awayTeam);
    const homeName = str(home?.name) ?? str(home?.shortName);
    const awayName = str(away?.name) ?? str(away?.shortName);
    if ((typeof id !== "number" && typeof id !== "string") || !kickoff || !homeName || !awayName || !home?.id || !away?.id) {
      continue;
    }
    const status = footballDataStatus(str(match.status) ?? "");
    const fullTime = rec(rec(match.score)?.fullTime);
    const referees = Array.isArray(match.referees) ? match.referees : [];
    const referee = referees
      .map(rec)
      .find((person) => str(person?.type)?.toUpperCase() === "REFEREE" || str(person?.name));
    parsed.push({
      id: `fd-${id}`,
      kickoff,
      status,
      minute: null,
      homeId: `fd-${home?.id}`,
      homeName: italianName(homeName),
      awayId: `fd-${away?.id}`,
      awayName: italianName(awayName),
      homeScore: status === "finita" || status === "in corso" ? num(fullTime?.home) : null,
      awayScore: status === "finita" || status === "in corso" ? num(fullTime?.away) : null,
      venue: str(match.venue),
      referee: str(referee?.name),
    });
  }
  return parsed;
}

export async function probeFootballData(): Promise<{ status: number; note: string; matches: ParsedMatch[] | null }> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) {
    try {
      const response = await fetchText("https://api.football-data.org/v4/competitions/SA");
      return {
        status: response.status,
        note: "FOOTBALL_DATA_API_KEY assente. football-data.org senza token non viene usato come fonte.",
        matches: null,
      };
    } catch (error) {
      return {
        status: 0,
        note: `football-data.org non raggiungibile (${error instanceof Error ? error.message : "errore"}).`,
        matches: null,
      };
    }
  }
  try {
    const payload = await fetchJson("https://api.football-data.org/v4/competitions/SA/matches?status=SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED,POSTPONED", {
      "X-Auth-Token": key,
    });
    const matches = parseFootballDataMatches(payload);
    return {
      status: 200,
      note: matches.length ? "football-data.org ha risposto e fornisce il calendario." : "football-data.org ha risposto senza partite.",
      matches,
    };
  } catch (error) {
    return {
      status: 0,
      note: `football-data.org con chiave non utilizzabile (${error instanceof Error ? error.message : "errore"}).`,
      matches: null,
    };
  }
}
