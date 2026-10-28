import type { BookPrice, PriceLine } from "./types";

/** Fasce che il modello propone. Una fascia diversa, anche vicina, non si rinomina. */
export const MODEL_BANDS = ["0-2", "1-3", "2-4"] as const;

/** Linee under/over che le doppie usano. Le altre restano fuori se la pagina non è quella riga. */
export const MODEL_TOTALS = [1.5, 2.5, 3.5] as const;

export function dcKey(side: "1X" | "X2" | "12"): string {
  return `dc:${side}`;
}

export function mgKey(band: string): string {
  return `mg:${band}`;
}

export function ouKey(line: number, side: "O" | "U"): string {
  return `ou:${line.toFixed(1)}:${side}`;
}

export const BTTS_GG = "btts:gg";
export const BTTS_NG = "btts:ng";

function normToken(token: string): string {
  const text = token.trim();
  if (text === "Gol" || text === "GG") return "gg";
  if (text === "No gol" || text === "NG") return "ng";
  if (text === "1X" || text === "X2" || text === "12") return text;
  const band = text.match(/^Multigol (\d-\d)$/);
  if (band) return `mg${band[1]}`;
  const total = text.match(/^(Over|Under) (\d+),(\d)$/);
  if (total) return `${total[1] === "Over" ? "O" : "U"}${total[2]}.${total[3]}`;
  return text;
}

/** Chiave della doppia, indipendente dall'ordine delle gambe. */
export function comboKey(left: string, right: string): string {
  return `combo:${[normToken(left), normToken(right)].sort().join("|")}`;
}

function lineOf(lines: Record<string, PriceLine>, key: string): PriceLine | null {
  const row = lines[key];
  if (!row || !(row.price > 1) || !row.bookmaker) return null;
  return row;
}

/**
 * Prezzo pubblicato per la riga esatta.
 * Il segno e il totale unico senza voce nel listino esteso restano quelli del tabellone (DraftKings).
 * Non calcola 1/probabilità e non moltiplica due quote.
 */
export function publishedPrice(
  market: string,
  selection: string,
  odds: BookPrice | null | undefined,
): PriceLine | null {
  if (!odds) return null;
  const lines = odds.lines ?? {};
  if (market === "segno") {
    const price = selection.startsWith("1 —")
      ? odds.home
      : selection.startsWith("X —")
        ? odds.draw
        : selection.startsWith("2 —")
          ? odds.away
          : null;
    if (price != null && price > 1) return { price, bookmaker: odds.bookmaker };
    return null;
  }
  if (market === "doppia_chance") {
    const side = selection.startsWith("1X") ? "1X" : selection.startsWith("X2") ? "X2" : selection.startsWith("12") ? "12" : null;
    return side ? lineOf(lines, dcKey(side)) : null;
  }
  if (market === "multigol") {
    const band = selection.match(/(\d-\d)/);
    if (!band || !MODEL_BANDS.includes(band[1] as (typeof MODEL_BANDS)[number])) return null;
    return lineOf(lines, mgKey(band[1]));
  }
  if (market === "gol") {
    if (selection.startsWith("No gol")) return lineOf(lines, BTTS_NG);
    if (selection.startsWith("Gol")) return lineOf(lines, BTTS_GG);
    return null;
  }
  if (market === "under_over") {
    const line = selection.match(/^(Over|Under) (\d+),(\d)/);
    if (!line) return null;
    const fromBook = lineOf(lines, ouKey(Number(`${line[2]}.${line[3]}`), line[1] === "Over" ? "O" : "U"));
    if (fromBook) return fromBook;
    if (odds.totalLine == null) return null;
    const value = Number(`${line[2]}.${line[3]}`);
    if (Math.abs(value - odds.totalLine) > 0.01) return null;
    const price = line[1] === "Over" ? odds.over : odds.under;
    if (price != null && price > 1) return { price, bookmaker: odds.bookmaker };
    return null;
  }
  if (market === "combo") {
    const parts = selection.replace(/^Doppia:\s*/, "").split(" + ").map((part) => part.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return lineOf(lines, comboKey(parts[0], parts[1]));
  }
  return null;
}
