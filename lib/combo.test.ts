import assert from "node:assert/strict";
import { comboHits, comboOverlaps } from "./combo";

assert.equal(comboOverlaps("Multigol 2-4", "Under 3,5"), true);
assert.equal(comboOverlaps("Multigol 0-2", "Under 2,5"), true);
assert.equal(comboOverlaps("Multigol 2-4", "Over 1,5"), true);
assert.equal(comboOverlaps("Multigol 2-4", "Over 2,5"), false);
assert.equal(comboOverlaps("Multigol 1-3", "Over 1,5"), false);
assert.equal(comboOverlaps("Gol", "Over 1,5"), true);
assert.equal(comboOverlaps("X2", "Multigol 2-4"), false);
assert.equal(comboOverlaps("X2", "Gol"), false);
assert.equal(comboOverlaps("X2", "No gol"), false);
assert.equal(comboOverlaps("1X", "No gol"), false);

assert.equal(comboHits("Doppia: X2 + Gol", 1, 2), true);
assert.equal(comboHits("Doppia: X2 + Gol", 1, 0), false);
assert.equal(comboHits("Doppia: X2 + Multigol 2-4", 0, 2), true);
assert.equal(comboHits("Doppia: X2 + Multigol 2-4", 0, 1), false);
assert.equal(comboHits("Doppia: 1X + Under 2,5", 1, 1), true);
assert.equal(comboHits("Doppia: 1X + Under 2,5", 3, 1), false);
assert.equal(comboHits("Doppia: Gol + Over 1,5", 1, 1), true);
assert.equal(comboHits("Doppia: Gol + Over 1,5", 1, 0), false);
assert.equal(comboHits("Doppia: No gol + Under 2,5", 1, 0), true);
assert.equal(comboHits("Doppia: X2 + Qualcosa", 0, 1), null);

console.log("combo ok");
