import assert from "node:assert/strict";
import { judgeStake } from "./worth";

const venezia = judgeStake(0.84, "1.08", "alta");
assert.equal(venezia.verdict, "irrisorio");
assert.equal(venezia.conviene, false);
assert.equal(venezia.headline, "Probabilità alta, rendimento irrisorio.");
assert.match(venezia.detail, /su €1 l'utile se vince è €0,08/);
assert.match(venezia.detail, /su €2 l'utile se vince è €0,16/);
assert.match(venezia.detail, /perdi l'intera posta/);

const comma = judgeStake(0.84, "1,08", "alta");
assert.equal(comma.verdict, "irrisorio");

const missing = judgeStake(0.84, "", "alta");
assert.equal(missing.verdict, "manca");
assert.equal(missing.conviene, false);
assert.match(missing.headline, /Quota mancante/);

const empty = judgeStake(0.9, null, "alta");
assert.equal(empty.conviene, false);

const positiveTiny = judgeStake(0.95, "1,08", "alta");
assert.equal(positiveTiny.verdict, "irrisorio");
assert.equal(positiveTiny.conviene, false);

const negativeEv = judgeStake(0.8, "1,20", "alta");
assert.equal(negativeEv.verdict, "atteso-negativo");
assert.equal(negativeEv.conviene, false);
assert.match(negativeEv.detail, /su €1 l'utile se vince è €0,20/);
assert.match(negativeEv.detail, /su €2 l'utile se vince è €0,40/);

const worth = judgeStake(0.8, "1,50", "alta");
assert.equal(worth.verdict, "conviene");
assert.equal(worth.conviene, true);
assert.match(worth.detail, /su €1 l'utile se vince è €0,50/);
assert.match(worth.detail, /su €2 l'utile se vince è €1,00/);

const noProb = judgeStake(null, "1,50", "media");
assert.equal(noProb.verdict, "senza-probabilita");
assert.equal(noProb.conviene, false);

const bad = judgeStake(0.8, "0,9", "alta");
assert.equal(bad.verdict, "non-valida");

const comboLow = judgeStake(0.62, "1,08", "alta");
assert.equal(comboLow.verdict, "irrisorio");
assert.equal(comboLow.conviene, false);
assert.equal(comboLow.headline, "Probabilità alta, rendimento irrisorio.");
assert.match(comboLow.detail, /su €1 l'utile se vince è €0,08/);
assert.match(comboLow.detail, /su €2 l'utile se vince è €0,16/);

console.log("worth ok");
