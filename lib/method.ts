import { formatNum, formatPct } from "./format";
import { THRESHOLDS } from "./thresholds";

export type Fascia = "prudente" | "equilibrata" | "coraggiosa" | "azzardo";

export type OutcomeProb = { p1: number; px: number; p2: number };

/** Quota americana (DraftKings/ESPN) → decimale. Un numero già decimale, fra 1 e 100, resta com’è. */
export function americanToDecimal(raw: unknown): number | null {
  if (typeof raw === "string") {
    const text = raw.trim().replace(",", ".");
    if (!text) return null;
    return americanToDecimal(Number(text.replace(/^\+/, "")));
  }
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw === 0) return null;
  if (Math.abs(raw) >= 100) return raw > 0 ? 1 + raw / 100 : 1 + 100 / Math.abs(raw);
  if (raw > 1) return raw;
  return null;
}

export function implied1x2(home: number, draw: number, away: number): OutcomeProb | null {
  if (!(home > 1 && draw > 1 && away > 1)) return null;
  const i1 = 1 / home;
  const ix = 1 / draw;
  const i2 = 1 / away;
  const sum = i1 + ix + i2;
  if (!(sum > 0)) return null;
  return { p1: i1 / sum, px: ix / sum, p2: i2 / sum };
}

export function fasciaOf(probability: number): Fascia {
  if (probability >= THRESHOLDS.fasciaPrudente) return "prudente";
  if (probability >= THRESHOLDS.fasciaEquilibrata) return "equilibrata";
  if (probability >= THRESHOLDS.fasciaCoraggiosa) return "coraggiosa";
  return "azzardo";
}

export function modelWeight(matchesPlayed: number): number {
  return matchesPlayed >= THRESHOLDS.modelWeightAfterMatches
    ? THRESHOLDS.modelWeightLate
    : THRESHOLDS.modelWeightEarly;
}

export function shrinkRate(rate: number, samples: number, k = THRESHOLDS.shrinkK): number {
  if (samples <= 0) return 1;
  return (samples * rate + k) / (samples + k);
}

export function methodLambdas(input: {
  homeGf: number;
  homeGa: number;
  homePlayed: number;
  awayGf: number;
  awayGa: number;
  awayPlayed: number;
  muHome: number;
  muAway: number;
}): { home: number; away: number } | null {
  const { homePlayed, awayPlayed, muHome, muAway } = input;
  if (homePlayed < 1 || awayPlayed < 1 || muHome <= 0 || muAway <= 0) return null;
  const avg = (muHome + muAway) / 2;
  if (avg <= 0) return null;
  const attackHome = shrinkRate(input.homeGf / homePlayed / avg, homePlayed);
  const defenseHome = shrinkRate(input.homeGa / homePlayed / avg, homePlayed);
  const attackAway = shrinkRate(input.awayGf / awayPlayed / avg, awayPlayed);
  const defenseAway = shrinkRate(input.awayGa / awayPlayed / avg, awayPlayed);
  return {
    home: muHome * attackHome * defenseAway,
    away: muAway * attackAway * defenseHome,
  };
}

export function capFactor(value: number): number {
  return Math.min(1 + THRESHOLDS.correctionCap, Math.max(1 - THRESHOLDS.correctionCap, value));
}

export function poissonGrid(lambdaHome: number, lambdaAway: number, max = 7): number[][] {
  const row = (lambda: number) => {
    const values: number[] = [];
    let term = Math.exp(-lambda);
    values.push(term);
    for (let k = 1; k <= max; k += 1) {
      term *= lambda / k;
      values.push(term);
    }
    return values;
  };
  const home = row(lambdaHome);
  const away = row(lambdaAway);
  return home.map((ph) => away.map((pa) => ph * pa));
}

export function outcomeProbs(grid: number[][]): OutcomeProb {
  let p1 = 0;
  let px = 0;
  let p2 = 0;
  for (let home = 0; home < grid.length; home += 1) {
    for (let away = 0; away < grid[home].length; away += 1) {
      const p = grid[home][away] ?? 0;
      if (home > away) p1 += p;
      else if (home === away) px += p;
      else p2 += p;
    }
  }
  const sum = p1 + px + p2 || 1;
  return { p1: p1 / sum, px: px / sum, p2: p2 / sum };
}

export function gridTotals(grid: number[][]): number[] {
  const total: number[] = [];
  for (let home = 0; home < grid.length; home += 1) {
    for (let away = 0; away < grid[home].length; away += 1) {
      const goals = home + away;
      total[goals] = (total[goals] ?? 0) + (grid[home][away] ?? 0);
    }
  }
  const sum = total.reduce((acc, value) => acc + value, 0) || 1;
  return total.map((value) => value / sum);
}

export function gridJoint(grid: number[][], preds: ((home: number, away: number) => boolean)[]): number {
  let hit = 0;
  let sum = 0;
  for (let home = 0; home < grid.length; home += 1) {
    for (let away = 0; away < grid[home].length; away += 1) {
      const p = grid[home][away] ?? 0;
      sum += p;
      if (preds.every((pred) => pred(home, away))) hit += p;
    }
  }
  return sum ? hit / sum : 0;
}

/** Riscrive la griglia perché 1, X e 2 coincidano con la fusione mercato/modello. */
export function blendGrid(model: number[][], market: OutcomeProb, weight: number): number[][] {
  const current = outcomeProbs(model);
  const fin = {
    p1: weight * current.p1 + (1 - weight) * market.p1,
    px: weight * current.px + (1 - weight) * market.px,
    p2: weight * current.p2 + (1 - weight) * market.p2,
  };
  const scale = (modelP: number, finalP: number) => (modelP > 1e-9 ? finalP / modelP : 0);
  const homeScale = scale(current.p1, fin.p1);
  const drawScale = scale(current.px, fin.px);
  const awayScale = scale(current.p2, fin.p2);
  const next = model.map((row, home) =>
    row.map((value, away) => {
      const factor = home > away ? homeScale : home === away ? drawScale : awayScale;
      return value * factor;
    }),
  );
  const sum = next.reduce((acc, row) => acc + row.reduce((inner, value) => inner + value, 0), 0) || 1;
  return next.map((row) => row.map((value) => value / sum));
}

export function multipleExclusion(input: {
  oddsComplete: boolean;
  lineup: boolean;
  market: OutcomeProb | null;
  model: OutcomeProb | null;
}): string | null {
  if (!input.oddsComplete || !input.market) {
    return "Quote 1X2 incomplete: dato assente. Esclusa dalle multiple.";
  }
  if (!input.lineup) return "Formazioni ufficiali: dato assente. Esclusa dalle multiple.";
  const favorite = Math.max(input.market.p1, input.market.px, input.market.p2);
  if (favorite < THRESHOLDS.favoriteMin) {
    return "Il favorito del mercato è sotto il 40%. Esclusa dalle multiple.";
  }
  if (!input.model) return "Confronto modello-mercato: dato assente. Esclusa dalle multiple.";
  const gap = Math.max(
    Math.abs(input.model.p1 - input.market.p1),
    Math.abs(input.model.px - input.market.px),
    Math.abs(input.model.p2 - input.market.p2),
  );
  if (gap > THRESHOLDS.marketGapExclude) {
    return "Modello e mercato distano più di 15 punti su un segno. Esclusa dalle multiple.";
  }
  return null;
}

export type PricedLeg = {
  matchId: string;
  home: string;
  away: string;
  selection: string;
  probability: number;
  quota: number;
  bookmaker?: string | null;
};

export function bestLeg(legs: PricedLeg[], fascia: Fascia): PricedLeg | null {
  const band = legs.filter(
    (leg) => fasciaOf(leg.probability) === fascia && leg.quota - 1 >= THRESHOLDS.minProfitPerEuro,
  );
  if (!band.length) return null;
  band.sort((a, b) => b.probability * b.quota - a.probability * a.quota || b.probability - a.probability);
  return band[0] ?? null;
}

export function assembleSchedina(legs: PricedLeg[], max = THRESHOLDS.multiMaxLegs): {
  events: PricedLeg[];
  probability: number | null;
  quota: number | null;
} {
  const chosen = [...legs].sort((a, b) => b.probability * b.quota - a.probability * a.quota).slice(0, max);
  chosen.sort((a, b) => a.probability - b.probability);
  if (!chosen.length) return { events: [], probability: null, quota: null };
  return {
    events: chosen,
    probability: chosen.reduce((product, leg) => product * leg.probability, 1),
    quota: chosen.reduce((product, leg) => product * leg.quota, 1),
  };
}

export function oneDecimalPct(probability: number): string {
  return `${(probability * 100).toFixed(1).replace(".", ",")}%`;
}

export function fusionSentence(
  market: OutcomeProb | null,
  model: OutcomeProb | null,
  weight: number | null,
): string {
  if (!market) return "Fusione col mercato non fatta: le quote 1X2 sono dato assente.";
  if (!model || weight == null) {
    return `Solo mercato normalizzato: 1 ${formatPct(market.p1)}, X ${formatPct(market.px)}, 2 ${formatPct(market.p2)}. Il Poisson del metodo non entra.`;
  }
  const fin = {
    p1: weight * model.p1 + (1 - weight) * market.p1,
    px: weight * model.px + (1 - weight) * market.px,
    p2: weight * model.p2 + (1 - weight) * market.p2,
  };
  return `Mercato normalizzato 1 ${formatPct(market.p1)}, X ${formatPct(market.px)}, 2 ${formatPct(market.p2)}. Poisson 1 ${formatPct(model.p1)}, X ${formatPct(model.px)}, 2 ${formatPct(model.p2)}. Peso del modello ${formatNum(weight, 2)}, stima fusa 1 ${formatPct(fin.p1)}, X ${formatPct(fin.px)}, 2 ${formatPct(fin.p2)}.`;
}
