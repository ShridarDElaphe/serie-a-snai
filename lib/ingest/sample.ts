import type { ParsedMatch } from "./espn";

const TEAMS = {
  mil: "Milan",
  bol: "Bologna",
  int: "Inter",
  ven: "Venezia",
} as const;

function game(
  id: string,
  day: string,
  home: keyof typeof TEAMS,
  away: keyof typeof TEAMS,
  status: ParsedMatch["status"],
  score: [number, number] | null,
): ParsedMatch {
  return {
    id: `sample-${id}`,
    kickoff: `${day}T17:00:00Z`,
    status,
    minute: null,
    homeId: `sample-${home}`,
    homeName: TEAMS[home],
    awayId: `sample-${away}`,
    awayName: TEAMS[away],
    homeScore: score?.[0] ?? null,
    awayScore: score?.[1] ?? null,
    venue: "Stadio di esempio",
    referee: null,
  };
}

/** Calendario finto, usato solo se le fonti live non rispondono. */
export function sampleMatches(): ParsedMatch[] {
  return [
    game("1", "2026-09-14", "mil", "ven", "finita", [2, 0]),
    game("2", "2026-09-14", "int", "bol", "finita", [2, 0]),
    game("3", "2026-09-21", "mil", "bol", "finita", [1, 0]),
    game("4", "2026-09-21", "int", "ven", "finita", [3, 0]),
    game("5", "2026-09-28", "bol", "int", "finita", [0, 2]),
    game("6", "2026-09-28", "ven", "mil", "finita", [0, 1]),
    game("7", "2026-10-05", "mil", "int", "finita", [2, 1]),
    game("8", "2026-10-05", "bol", "ven", "finita", [1, 0]),
    game("9", "2026-10-28", "mil", "bol", "non iniziata", null),
    game("10", "2026-10-28", "ven", "int", "non iniziata", null),
  ];
}
