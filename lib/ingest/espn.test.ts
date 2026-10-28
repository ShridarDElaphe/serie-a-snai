import assert from "node:assert/strict";
import { interpretStatus, parseBookOdds, parseEvent, parseScoreboard } from "./espn";
import { parseRss, parseRssDate } from "./news";

assert.equal(interpretStatus("STATUS_SCHEDULED", "pre"), "non iniziata");
assert.equal(interpretStatus("STATUS_IN_PROGRESS", "in"), "in corso");
assert.equal(interpretStatus("STATUS_FULL_TIME", "post"), "finita");
assert.equal(interpretStatus("STATUS_POSTPONED", "post"), "rinviata");

const board = parseScoreboard({
  leagues: [{ calendar: ["2026-10-28T07:00Z"] }],
  events: [
    {
      id: "1",
      date: "2026-10-28T17:30:00Z",
      status: { type: { name: "STATUS_SCHEDULED", state: "pre" }, displayClock: "0'" },
      competitions: [
        {
          venue: { fullName: "San Siro" },
          competitors: [
            { homeAway: "home", score: "0", team: { id: "103", displayName: "AC Milan" } },
            { homeAway: "away", score: "0", team: { id: "107", displayName: "Bologna" } },
          ],
        },
      ],
    },
    {
      id: "2",
      date: "2026-10-25T19:45:00Z",
      status: { type: { name: "STATUS_FULL_TIME", state: "post", completed: true } },
      competitions: [
        {
          competitors: [
            { homeAway: "home", score: "0", team: { id: "118", displayName: "Udinese" } },
            { homeAway: "away", score: "2", team: { id: "103", displayName: "AC Milan" } },
          ],
        },
      ],
    },
  ],
});

assert.equal(board.dates[0], "20261028");
assert.equal(board.matches[0]?.homeName, "Milan");
assert.equal(board.matches[0]?.homeScore, null);
assert.equal(board.matches[0]?.status, "non iniziata");
assert.equal(board.matches[1]?.homeScore, 0);
assert.equal(board.matches[1]?.awayScore, 2);
assert.equal(parseEvent({ id: "x" }), null);

const priced = parseBookOdds({
  events: [
    {
      id: "401874773",
      competitions: [
        {
          odds: [
            {
              overUnder: 3.5,
              provider: { displayName: "DraftKings" },
              moneyline: {
                home: { close: { odds: "+600" } },
                away: { close: { odds: "-280" } },
                draw: { close: { odds: "+400" } },
              },
              total: {
                over: { close: { line: "o3.5", odds: "+100" } },
                under: { close: { line: "u3.5", odds: "-130" } },
              },
            },
          ],
        },
      ],
    },
  ],
});
assert.equal(priced[0]?.bookmaker, "DraftKings");
assert.equal(priced[0]?.home, 7);
assert.ok(priced[0]?.away != null && Math.abs(priced[0].away - (1 + 100 / 280)) < 1e-9);
assert.equal(priced[0]?.draw, 5);
assert.equal(priced[0]?.totalLine, 3.5);
assert.equal(priced[0]?.over, 2);
assert.equal(parseBookOdds({ events: [{ id: "1", competitions: [{}] }] }).length, 0);

const rss = parseRss(`<?xml version="1.0"?><rss><channel><item>
  <title><![CDATA[Milan, turnover prima di Bologna]]></title>
  <link>https://example.test/milan</link>
  <pubDate>Wed, 28 Oct 2026 12:00:00 GMT</pubDate>
  <description>Formazione rivista.</description>
</item></channel></rss>`);
assert.equal(rss.length, 1);
assert.match(rss[0]?.title ?? "", /Milan/);
assert.ok(parseRssDate("mer, 28 ott 2026 13:06:23 GMT") > Date.parse("2026-10-28T00:00:00Z"));

console.log("parser ok");
