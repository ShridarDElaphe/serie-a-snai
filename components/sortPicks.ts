import type { PickView } from "@/lib/view";

const MARKET_ORDER = ["segno", "under_over", "doppia_chance", "multigol", "marcatore", "ammonizioni", "combo"];

/** Singole prima, doppie dopo. Dentro lo stesso mercato, la probabilità più alta sta sopra. */
export function sortPicks(picks: PickView[]): PickView[] {
  return [...picks].sort((a, b) => {
    const left = MARKET_ORDER.indexOf(a.market);
    const right = MARKET_ORDER.indexOf(b.market);
    const order = (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
    if (order !== 0) return order;
    return (b.probability ?? -1) - (a.probability ?? -1);
  });
}
