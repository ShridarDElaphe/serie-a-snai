import { THRESHOLDS } from "./thresholds";

export function romeDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Giornata che contiene la data di Roma di oggi; se oggi non si gioca, la prima ancora aperta. */
export function focusMatchdays(
  matches: { matchday: number; kickoff: string; status: string }[],
): { current: number | null; next: number | null } {
  const ordered = [...matches].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const today = romeDay(new Date().toISOString());
  const todayMatch = ordered.find((match) => romeDay(match.kickoff) === today);
  const open = ordered.find((match) => match.status === "non iniziata" || match.status === "in corso");
  const current = todayMatch?.matchday ?? open?.matchday ?? ordered.at(-1)?.matchday ?? null;
  const next = current == null ? null : (ordered.find((match) => match.matchday > current)?.matchday ?? null);
  return { current, next };
}

export function assignMatchdays(matches: { id: string; kickoff: string }[]): Map<string, number> {
  const sorted = [...matches].sort(
    (a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id),
  );
  const map = new Map<string, number>();
  let day = 0;
  let count = 0;
  let start = "";
  for (const match of sorted) {
    const spanH = start ? (Date.parse(match.kickoff) - Date.parse(start)) / 3_600_000 : 0;
    const fresh =
      !start || count >= THRESHOLDS.matchdaySize || spanH > THRESHOLDS.matchdaySpanHours;
    if (fresh) {
      day += 1;
      count = 0;
      start = match.kickoff;
    }
    count += 1;
    map.set(match.id, day);
  }
  return map;
}
