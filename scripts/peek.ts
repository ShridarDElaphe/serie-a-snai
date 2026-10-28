import { all, get, metaGet } from "../lib/db";

const days = all<{
  matchday: number;
  start: string;
  end: string;
  fin: number;
  pre: number;
  live: number;
  n: number;
}>(
  `SELECT matchday,
          MIN(kickoff) AS start,
          MAX(kickoff) AS end,
          SUM(status = 'finita') AS fin,
          SUM(status = 'non iniziata') AS pre,
          SUM(status = 'in corso') AS live,
          COUNT(*) AS n
   FROM matches GROUP BY matchday ORDER BY matchday`,
);
console.log(days);
console.log(
  "proposals",
  all("SELECT origin, confidence, market, outcome, COUNT(*) AS n FROM proposals GROUP BY 1, 2, 3, 4"),
);
console.log(
  "slip",
  all(
    `SELECT selection, confidence, sicura, probability, m.home_name, m.away_name, m.status, m.kickoff
     FROM proposals p JOIN matches m ON m.id = p.match_id
     WHERE origin = 'live' AND confidence = 'alta' AND m.status != 'finita'
     ORDER BY sort_key DESC`,
  ),
);
const source = JSON.parse(metaGet("source") ?? "{}") as { fixtures: string; sample: boolean; news: unknown };
console.log("fixtures", source.fixtures, "sample", source.sample, "news", source.news);
console.log("news rows", get("SELECT COUNT(*) AS n FROM news"), "links", get("SELECT COUNT(*) AS n FROM news_teams"));
console.log("lineups", get("SELECT COUNT(*) AS n FROM lineups"), "cards", get("SELECT COUNT(*) AS n FROM match_cards"));
console.log("standings", all("SELECT rank, name, points, gf, ga, played FROM standings ORDER BY rank LIMIT 8"));
