/**
 * Due gambe che ripetono lo stesso conteggio di gol.
 * Multigol con under è sempre così. Multigol con over lo è se la fascia sta già tutta sopra la linea.
 * Gol implica over 1,5, perché entrambe le squadre a segno fanno almeno due gol.
 */
export function comboOverlaps(left: string, right: string): boolean {
  const parts = [left, right];
  const multigol = parts.find((part) => part.startsWith("Multigol "));
  const total = parts.find((part) => part.startsWith("Over ") || part.startsWith("Under "));
  if (multigol && total) {
    if (total.startsWith("Under")) return true;
    const band = multigol.match(/Multigol (\d)-(\d)/);
    const line = total.match(/Over (\d),(\d)/);
    if (!band || !line) return true;
    const low = Number(band[1]);
    const goals = Number(`${line[1]}.${line[2]}`);
    return low > goals;
  }
  return parts.includes("Gol") && parts.some((part) => part.startsWith("Over 1,"));
}

/** Esito di una doppia già scritta, dal punteggio. Non calcola quote. */

export function comboHits(selection: string, home: number, away: number): boolean | null {
  const body = selection.replace(/^Doppia:\s*/, "");
  const parts = body.split(" + ");
  if (parts.length !== 2) return null;
  const hits = parts.map((part) => legHits(part.trim(), home, away));
  if (hits.some((hit) => hit == null)) return null;
  return hits.every(Boolean);
}

function legHits(part: string, home: number, away: number): boolean | null {
  const total = home + away;
  if (part.startsWith("1X")) return home >= away;
  if (part.startsWith("X2")) return away >= home;
  if (part.startsWith("12")) return home !== away;
  const band = part.match(/^Multigol (\d)-(\d)$/);
  if (band) return total >= Number(band[1]) && total <= Number(band[2]);
  if (part === "Gol") return home > 0 && away > 0;
  if (part === "No gol") return home === 0 || away === 0;
  const line = part.match(/^(Over|Under) (\d),(\d)$/);
  if (!line) return null;
  const goals = Number(`${line[2]}.${line[3]}`);
  return line[1] === "Over" ? total > goals : total < goals;
}
