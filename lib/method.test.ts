import assert from "node:assert/strict";
import { judgeStake } from "./worth";
import {
  americanToDecimal,
  assembleSchedina,
  bestLeg,
  blendGrid,
  fasciaOf,
  implied1x2,
  multipleExclusion,
  oneDecimalPct,
  outcomeProbs,
  poissonGrid,
} from "./method";

const venezia = implied1x2(8.2, 5.4, 1.33);
assert.ok(venezia);
assert.equal(oneDecimalPct(venezia.p1), "11,5%");
assert.equal(oneDecimalPct(venezia.px), "17,5%");
assert.equal(oneDecimalPct(venezia.p2), "71,0%");
assert.equal(fasciaOf(venezia.p2), "equilibrata");
assert.notEqual(fasciaOf(venezia.p2), "prudente");

const milan = implied1x2(1.62, 3.85, 5.6);
assert.ok(milan);
assert.equal(oneDecimalPct(milan.p1), "58,5%");
assert.equal(oneDecimalPct(milan.px), "24,6%");
assert.equal(oneDecimalPct(milan.p2), "16,9%");
assert.equal(oneDecimalPct(milan.p1 + milan.px), "83,1%");
assert.equal(fasciaOf(milan.p1 + milan.px), "prudente");

const genoa = implied1x2(5.4, 3.65, 1.67);
assert.ok(genoa);
assert.equal(oneDecimalPct(genoa.p1), "17,5%");
assert.equal(oneDecimalPct(genoa.px), "25,9%");
assert.equal(oneDecimalPct(genoa.p2), "56,6%");
assert.equal(oneDecimalPct(genoa.px + genoa.p2), "82,5%");

const monza = implied1x2(4.1, 3.9, 1.8);
assert.ok(monza);
assert.equal(oneDecimalPct(monza.p1), "23,1%");
assert.equal(oneDecimalPct(monza.px), "24,3%");
assert.equal(oneDecimalPct(monza.p2), "52,6%");
assert.equal(oneDecimalPct(monza.px + monza.p2), "76,9%");
assert.equal(fasciaOf(monza.px + monza.p2), "equilibrata");

assert.equal(
  multipleExclusion({ oddsComplete: false, lineup: false, market: null, model: null }),
  "Quote 1X2 incomplete: dato assente. Esclusa dalle multiple.",
);
assert.match(
  multipleExclusion({ oddsComplete: true, lineup: false, market: venezia, model: venezia }) ?? "",
  /Formazioni ufficiali: dato assente/,
);

const grid = poissonGrid(1.2, 0.8, 7);
const blended = blendGrid(grid, venezia, 0);
const flat = outcomeProbs(blended);
assert.ok(Math.abs(flat.p1 - venezia.p1) < 1e-9);
assert.ok(Math.abs(flat.px - venezia.px) < 1e-9);
assert.ok(Math.abs(flat.p2 - venezia.p2) < 1e-9);

const short = americanToDecimal(-1250);
assert.ok(short);
assert.ok(Math.abs(short - 1.08) < 1e-9);
const pricedShort = judgeStake(0.84, String(short), "alta");
assert.equal(pricedShort.verdict, "irrisorio");
assert.equal(pricedShort.conviene, false);

assert.equal(americanToDecimal("-150") != null && Math.abs((americanToDecimal("-150") ?? 0) - (1 + 100 / 150)) < 1e-9, true);
assert.equal(americanToDecimal("+400"), 5);

const slip = assembleSchedina([
  bestLeg(
    [
      { matchId: "a", home: "Milan", away: "Bologna", selection: "1X", probability: 0.831, quota: 1.13 },
      { matchId: "a", home: "Milan", away: "Bologna", selection: "1", probability: 0.585, quota: 1.62 },
    ],
    "prudente",
  ),
  bestLeg(
    [{ matchId: "b", home: "Venezia", away: "Inter", selection: "2", probability: 0.71, quota: 1.33 }],
    "equilibrata",
  ),
].filter((leg): leg is NonNullable<typeof leg> => leg != null));
assert.equal(slip.events[0]?.selection, "2");
assert.equal(slip.events[1]?.selection, "1X");
assert.ok(slip.quota != null && Math.abs(slip.quota - 1.13 * 1.33) < 1e-9);

console.log("metodo ok");
