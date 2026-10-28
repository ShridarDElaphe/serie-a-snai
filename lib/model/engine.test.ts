import assert from "node:assert/strict";
import { decide, pickBand, scoreProbs } from "./engine";
import type { DecideInput, FinishedMatch, PlayerSeason } from "../types";

function match(
  index: number,
  homeId: string,
  awayId: string,
  homeGoals: number,
  awayGoals: number,
): FinishedMatch {
  const day = String(index + 1).padStart(2, "0");
  return {
    id: `m${index}`,
    kickoff: `2026-08-${day}T15:00:00Z`,
    homeId,
    awayId,
    homeName: homeId,
    awayName: awayId,
    homeGoals,
    awayGoals,
  };
}

function baseInput(overrides: Partial<DecideInput>): DecideInput {
  return {
    homeId: "H",
    awayId: "A",
    homeName: "Casa Forte",
    awayName: "Ospite Debole",
    kickoff: "2026-10-28T17:30:00Z",
    prior: [],
    standings: null,
    players: [],
    lineup: null,
    injuries: [],
    teamCards: [],
    referee: null,
    news: [],
    now: Date.parse("2026-10-28T12:00:00Z"),
    allowSquad: true,
    ...overrides,
  };
}

const strongPrior: FinishedMatch[] = [];
for (let i = 0; i < 6; i += 1) strongPrior.push(match(i, "H", "X", 2, 0));
for (let i = 0; i < 4; i += 1) strongPrior.push(match(10 + i, "Y", "A", 2, 0));

const probs = scoreProbs(1.4, 1.1);
assert.ok(Math.abs(probs.p1 + probs.px + probs.p2 - 1) < 1e-9);

assert.equal(pickBand(2.4)?.id, "1-3");
assert.equal(pickBand(1.2)?.id, "0-2");
assert.equal(pickBand(2)?.id, "1-3");
assert.equal(pickBand(3.2)?.id, "2-4");
assert.equal(pickBand(1.5)?.id, "0-2");
assert.equal(pickBand(4.5), null);

const strong = decide(baseInput({ prior: strongPrior }));
const dc = strong.proposals.filter((pick) => pick.market === "doppia_chance");
const oneX = dc.find((pick) => pick.selection.startsWith("1X"));
assert.ok(oneX, "la favorita in casa deve produrre 1X");
assert.equal(oneX?.confidence, "alta");
assert.equal(oneX?.sicura, true);
assert.ok((oneX?.probability ?? 0) >= 0.78);
assert.ok(strong.proposals.some((pick) => pick.market === "multigol"));
const combos = strong.proposals.filter((pick) => pick.market === "combo");
assert.ok(combos.length > 0, "la favorita deve produrre almeno una doppia");
assert.ok(combos.some((pick) => pick.selection.startsWith("Doppia: 1X + ")));
assert.ok(
  combos.some((pick) => pick.selection.includes("Multigol") || pick.selection.includes("Gol") || pick.selection.includes("Over") || pick.selection.includes("Under")),
);
for (const combo of combos) {
  assert.equal(combo.sicura, false);
  assert.ok((combo.probability ?? 0) >= 0.4 && (combo.probability ?? 1) < 1);
}
assert.equal(combos.some((pick) => pick.selection.startsWith("Over")), false);
assert.ok(strong.notes.some((note) => note.includes("dato assente")));
assert.equal(strong.proposals.some((pick) => pick.market === "marcatore"), false);
assert.equal(
  strong.proposals.some((pick) => pick.selection.startsWith("Over")),
  false,
);

const crisisPrior = [
  ...[0, 1, 2, 3, 4, 5].map((i) => match(i, "H", "X", 3, 0)),
  ...[6, 7, 8, 9, 10].map((i) => match(i, "Z", "H", 3, 0)),
  ...[11, 12, 13, 14].map((i) => match(i, "Y", "A", 2, 0)),
];
const crisis = decide(baseInput({ prior: crisisPrior }));
assert.equal(
  crisis.proposals.some((pick) => pick.market === "doppia_chance"),
  false,
  "la crisi blocca la doppia chance anche se i gol in casa restano alti",
);
assert.ok(crisis.notes.some((note) => note.includes("crisi")));

const shocked = decide(
  baseInput({
    prior: strongPrior,
    news: [
      {
        id: "n1",
        title: "Casa Forte, turnover e titolari a riposo",
        summary: "Formazione rivoluzionata per la coppa.",
        link: "https://example.test/1",
        publishedAt: "2026-10-28T11:30:00Z",
        source: "test",
        teamIds: ["H"],
      },
    ],
  }),
);
const shockedDc = shocked.proposals.find((pick) => pick.selection.startsWith("1X"));
assert.ok(!shockedDc || shockedDc.confidence === "media");
assert.equal(shockedDc?.sicura ?? false, false);

const oldNews = decide(
  baseInput({
    prior: strongPrior,
    news: [
      {
        id: "n2",
        title: "Casa Forte, turnover e titolari a riposo",
        summary: "Formazione rivoluzionata.",
        link: "https://example.test/2",
        publishedAt: "2026-10-27T08:00:00Z",
        source: "test",
        teamIds: ["H"],
      },
    ],
  }),
);
assert.equal(oldNews.proposals.find((pick) => pick.selection.startsWith("1X"))?.sicura, true);

const scorer: PlayerSeason = {
  playerId: "p1",
  teamId: "H",
  name: "Marco Stabile",
  position: "F",
  appearances: 8,
  subIns: 1,
  goals: 6,
  yellows: 1,
  reds: 0,
  fouls: 4,
};
const withLineup = decide(
  baseInput({
    prior: strongPrior,
    players: [scorer],
    lineup: [
      { playerId: "p1", teamId: "H", name: "Marco Stabile", position: "F", starter: true },
      ...Array.from({ length: 10 }, (_, index) => ({
        playerId: `f${index}`,
        teamId: index < 5 ? "H" : "A",
        name: `Titolare ${index}`,
        position: index === 0 ? "G" : "D",
        starter: true,
      })),
    ],
  }),
);
const goalPick = withLineup.proposals.find((pick) => pick.market === "marcatore");
assert.ok(goalPick);
assert.equal(goalPick?.probability, null);
assert.match(goalPick?.reason ?? "", /dato assente/);
assert.equal(goalPick?.sicura, false);

const thin = decide(baseInput({ prior: [match(1, "H", "A", 1, 0)] }));
assert.equal(thin.proposals.some((pick) => pick.market === "doppia_chance"), false);
assert.ok(thin.notes.some((note) => note.includes("dato assente")));

console.log("modello ok");
