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
