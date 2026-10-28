import { createHash } from "node:crypto";
import { fetchText } from "./http";
import { teamsMentioned } from "../teams";

export type RssItem = {
  id: string;
  title: string;
  link: string;
  summary: string;
  publishedAt: string;
};

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  ndash: "-",
  mdash: "-",
  egrave: "è",
  eacute: "é",
  agrave: "à",
  ograve: "ò",
  ugrave: "ù",
  igrave: "ì",
};

export function decodeXml(value: string): string {
  const unwrapped = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return unwrapped
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => NAMED[name.toLowerCase()] ?? entity)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeXml(match[1] ?? "") : "";
}

const IT_MONTHS: Record<string, string> = {
  gen: "jan",
  feb: "feb",
  mar: "mar",
  apr: "apr",
  mag: "may",
  giu: "jun",
  lug: "jul",
  ago: "aug",
  set: "sep",
  ott: "oct",
  nov: "nov",
  dic: "dec",
};

export function parseRssDate(value: string): number {
  const normalized = value
    .replace(/^[a-zà]{3,},?\s+/i, "")
    .replace(/\b(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\b/i, (month) => IT_MONTHS[month.toLowerCase()] ?? month);
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : Date.parse(value);
}

export function parseRss(xml: string): RssItem[] {
  return xml
    .split(/<item\b[^>]*>/i)
    .slice(1)
    .map((block) => {
      const title = tag(block, "title");
      const link = tag(block, "link") || tag(block, "guid");
      const summary = tag(block, "description") || tag(block, "content:encoded");
      const published = tag(block, "pubDate") || tag(block, "dc:date");
      const time = parseRssDate(published);
      if (!title || !link || !Number.isFinite(time)) return null;
      return {
        id: createHash("sha1").update(link).digest("hex").slice(0, 16),
        title,
        link,
        summary: summary.slice(0, 500),
        publishedAt: new Date(time).toISOString(),
      };
    })
    .filter((item): item is RssItem => item != null);
}

export const FEEDS: { id: string; url: string; kind: "seriea" | "general" }[] = [
  { id: "tuttosport", url: "https://www.tuttosport.com/rss/calcio/serie-a", kind: "seriea" },
  { id: "corriere", url: "https://www.corrieredellosport.it/rss/calcio/serie-a", kind: "seriea" },
  { id: "sky", url: "https://sport.sky.it/rss/sport.xml", kind: "general" },
  { id: "gazzetta", url: "https://www.gazzetta.it/rss/serie-a.xml", kind: "seriea" },
];

export function attachTeams(
  item: RssItem,
  teams: { id: string; name: string }[],
  kind: "seriea" | "general",
) {
  return teamsMentioned(`${item.title}. ${item.summary}`, teams, kind);
}

export async function readFeed(url: string): Promise<{ status: number; items: RssItem[]; newest: string | null; error?: string }> {
  try {
    const response = await fetchText(url);
    if (response.status < 200 || response.status >= 300 || !response.body.includes("<item")) {
      return { status: response.status, items: [], newest: null, error: "risposta non RSS" };
    }
    const items = parseRss(response.body).slice(0, 40);
    const newest = items.reduce<string | null>((best, item) => (!best || item.publishedAt > best ? item.publishedAt : best), null);
    return { status: response.status, items, newest };
  } catch (error) {
    return { status: 0, items: [], newest: null, error: error instanceof Error ? error.message : "errore" };
  }
}
