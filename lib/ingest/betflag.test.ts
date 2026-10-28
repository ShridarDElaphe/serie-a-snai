import assert from "node:assert/strict";
import { comboKey, dcKey, mgKey, ouKey, publishedPrice } from "../price-key";
import { absorbMarkets, sameTeams } from "./betflag";

const payload = {
  leo: [
    {
      ei: 16418505,
      en: "Venezia - Inter",
      ed: "28-10-2026 18:30",
      mmkW: {
        a: {
          mn: "DC",
          spd: { "0.0": { asl: [{ sn: "1X", ov: 3.15 }, { sn: "12", ov: 1.14 }, { sn: "X2", ov: 1.08 }] } },
        },
        b: { mn: "GG/NG", spd: { "0.0": { asl: [{ sn: "GG", ov: 1.6 }, { sn: "NG", ov: 2.2 }] } } },
        c: {
          mn: "U/O",
          ds: 3.5,
          spd: {
            "0.5": { asl: [{ sn: "U", ov: 19 }, { sn: "O", ov: 0 }] },
            "1.5": { asl: [{ sn: "U", ov: 6.25 }, { sn: "O", ov: 1.09 }] },
            "2.5": { asl: [{ sn: "U", ov: 2.85 }, { sn: "O", ov: 1.37 }] },
            "3.5": { asl: [{ sn: "U", ov: 1.73 }, { sn: "O", ov: 1.95 }] },
          },
        },
        d: { mn: "1X2 + U/O", spd: { "2.5": { asl: [{ sn: "2-Ov", ov: 9 }] } } },
        e: { mn: " Numero Di Gol", spd: { "0.0": { asl: [{ sn: "0-1", ov: 3.35 }, { sn: "2-3", ov: 1.97 }] } } },
        f: {
          mn: " Multigol",
          spd: { "0.0": { asl: [{ sn: "1-3", ov: 1.43 }, { sn: "2-4", ov: 1.5 }, { sn: "1-2", ov: 2.1 }] } },
        },
        g: { mn: "DC + U/O", spd: { "2.5": { asl: [{ sn: "X2-Un", ov: 3.1 }, { sn: "X2-Ov", ov: 5.5 }] } } },
        h: { mn: "DC + GG/NG", spd: { "0.0": { asl: [{ sn: "X2-NG", ov: 4.8 }, { sn: "X2-GG", ov: 3.25 }] } } },
        i: { mn: "DC + Multigol 2-4", spd: { "0.0": { asl: [{ sn: "X2 + 2-4 Gol", ov: 3.25 }] } } },
        j: { mn: "GG/NG + U/O", spd: { "2.5": { asl: [{ sn: "NG-Un", ov: 2.25 }, { sn: "GG-Ov", ov: 2.45 }] } } },
        k: { mn: "DC + U/O 1T", spd: { "1.5": { asl: [{ sn: "X2-Un", ov: 9.99 }] } } },
        l: { mn: "1X2", spd: { "0.0": { asl: [{ sn: "1", ov: 7.5 }, { sn: "X", ov: 5.5 }, { sn: "2", ov: 1.35 }] } } },
      },
    },
  ],
};

const [event] = absorbMarkets(payload);
assert.ok(event);
assert.equal(event?.lines[dcKey("X2")]?.price, 1.08);
assert.equal(event?.lines[dcKey("X2")]?.bookmaker, "Betflag");
assert.equal(event?.lines[mgKey("0-2")], undefined);
assert.equal(event?.lines[mgKey("1-3")]?.price, 1.43);
assert.equal(event?.lines[mgKey("2-4")]?.price, 1.5);
assert.equal(event?.lines[mgKey("1-2")], undefined);
assert.equal(event?.lines[ouKey(1.5, "O")]?.price, 1.09);
assert.equal(event?.lines[ouKey(0.5, "O")], undefined);
assert.equal(event?.lines[comboKey("X2", "Over 2,5")]?.price, 5.5);
assert.equal(event?.lines[comboKey("X2", "No gol")]?.price, 4.8);
assert.equal(event?.lines[comboKey("X2", "Multigol 2-4")]?.price, 3.25);
assert.equal(event?.lines[comboKey("No gol", "Under 2,5")]?.price, 2.25);
assert.equal(Object.values(event?.lines ?? {}).some((line) => line.price === 9 || line.price === 9.99), false);
assert.equal(event?.homePrice, 7.5);
assert.equal(event?.awayPrice, 1.35);

const odds = {
  matchId: "401874773",
  bookmaker: "DraftKings",
  source: "ESPN scoreboard",
  readAt: "2026-10-28T16:00:00Z",
  home: 7,
  draw: 5.5,
  away: 1.33,
  totalLine: 3.5,
  over: 1.91,
  under: 1.87,
  lines: event?.lines,
};
assert.equal(publishedPrice("doppia_chance", "X2 — Inter o pareggio", odds)?.price, 1.08);
assert.equal(publishedPrice("doppia_chance", "X2 — Inter o pareggio", odds)?.bookmaker, "Betflag");
assert.equal(publishedPrice("multigol", "Multigol 0-2", odds), null);
assert.equal(publishedPrice("multigol", "Multigol 2-4", odds)?.price, 1.5);
assert.equal(publishedPrice("combo", "Doppia: X2 + No gol", odds)?.price, 4.8);
assert.equal(publishedPrice("combo", "Doppia: No gol + X2", odds)?.price, 4.8);
assert.equal(publishedPrice("under_over", "Over 3,5", odds)?.price, 1.95);
assert.equal(publishedPrice("under_over", "Over 3,5", odds)?.bookmaker, "Betflag");
assert.equal(publishedPrice("gol", "Gol — entrambe a segno", odds)?.price, 1.6);
assert.equal(publishedPrice("gol", "No gol — almeno una non segna", odds)?.price, 2.2);
assert.equal(publishedPrice("segno", "2 — Inter", odds)?.price, 1.33);
assert.equal(publishedPrice("segno", "2 — Inter", odds)?.bookmaker, "DraftKings");
assert.equal(sameTeams("Venezia", "Internazionale", "Venezia", "Inter"), true);
assert.equal(sameTeams("Internazionale", "Venezia", "Venezia", "Inter"), false);

console.log("betflag ok");
