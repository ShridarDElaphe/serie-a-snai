import { fetchJson, pool } from "./http";
import { italianName } from "../teams";
import type { PriceLine } from "../types";
import { BTTS_GG, BTTS_NG, comboKey, dcKey, mgKey, MODEL_BANDS, MODEL_TOTALS, ouKey } from "../price-key";

const BOOK = "Betflag";
const SOURCE = "https://sportservice.betflag.it";
const OVERVIEW = `${SOURCE}/api/sport/pregame/getOverviewEvents/0/1/93/0/0/0?channelId=1`;
const HEADERS = {
  Origin: "https://www.betflag.it",
  Referer: "https://www.betflag.it/",
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

/** Tab del listino che il panorama non include: multigol, doppie, doppia chance + multigol. */
const EXTRA_TABS = [1362, 1361, 1364] as const;

type Rec = Record<string, unknown>;

export type BetflagEvent = {
  eventId: number;
  home: string;
  away: string;
  /** Giorno di calendario a Roma, YYYY-MM-DD. */
  day: string;
  lines: Record<string, PriceLine>;
  homePrice: number | null;
  drawPrice: number | null;
  awayPrice: number | null;
  totalLine: number | null;
  over: number | null;
  under: number | null;
};

export type BetflagLoad = {
  events: BetflagEvent[];
  note: string;
};

function rec(value: unknown): Rec | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Quota decimale pubblicata. 0 e i vuoti non sono un prezzo. */
function priceOf(value: unknown): number | null {
  const price = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(price) || price <= 1) return null;
  return price;
}

export function romeDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function betflagDay(text: string): string | null {
  const match = text.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function sameTeams(homeA: string, awayA: string, homeB: string, awayB: string): boolean {
  return italianName(homeA) === italianName(homeB) && italianName(awayA) === italianName(awayB);
}

function put(lines: Record<string, PriceLine>, key: string, price: number | null) {
  if (price == null) return;
  lines[key] = { price, bookmaker: BOOK };
}

type Selection = { line: string; name: string; price: number };

function selections(market: Rec): Selection[] {
  const out: Selection[] = [];
  const spd = rec(market.spd) ?? {};
  for (const [line, block] of Object.entries(spd)) {
    const node = rec(block);
    for (const pick of arr(node?.asl)) {
      const row = rec(pick);
      const price = priceOf(row?.ov);
      const name = typeof row?.sn === "string" ? row.sn.trim() : "";
      if (price == null || !name) continue;
      out.push({ line, name, price });
    }
  }
  return out;
}

function lineNumber(text: string): number | null {
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return MODEL_TOTALS.some((line) => Math.abs(line - value) < 0.01) ? value : null;
}

/**
 * Copia solo i mercati il cui nome e la cui selezione coincidono con una riga che offriamo.
 * 1X2 + over non è doppia chance + over. 0-1 o 2-3 non diventano 0-2 o 2-4.
 */
export function absorbMarkets(payload: unknown, into?: BetflagEvent): BetflagEvent[] {
  const root = rec(payload);
  const events: BetflagEvent[] = [];
  for (const item of arr(root?.leo)) {
    const node = rec(item);
    if (!node) continue;
    const name = typeof node.en === "string" ? node.en : "";
    const parts = name.split(" - ").map((part) => part.trim());
    const day = betflagDay(typeof node.ed === "string" ? node.ed : "");
    const eventId = typeof node.ei === "number" ? node.ei : 0;
    if (parts.length < 2 || !day || !eventId) continue;
    const target =
      into && into.eventId === eventId
        ? into
        : ({
            eventId,
            home: parts[0] ?? "",
            away: parts[1] ?? "",
            day,
            lines: {},
            homePrice: null,
            drawPrice: null,
            awayPrice: null,
            totalLine: null,
            over: null,
            under: null,
          } satisfies BetflagEvent);
    const markets = rec(node.mmkW) ?? {};
    for (const market of Object.values(markets)) {
      const row = rec(market);
      if (!row || typeof row.mn !== "string") continue;
      absorbMarket(row.mn.trim(), row, target);
    }
    if (!into || into.eventId !== eventId) events.push(target);
  }
  return into ? [into] : events;
}

function absorbMarket(name: string, market: Rec, event: BetflagEvent) {
  const picks = selections(market);
  const folded = name.toLowerCase();
  if (folded === "1x2") {
    for (const pick of picks) {
      if (pick.name === "1") event.homePrice = pick.price;
      if (pick.name === "X") event.drawPrice = pick.price;
      if (pick.name === "2") event.awayPrice = pick.price;
    }
    return;
  }
  if (folded === "dc") {
    for (const pick of picks) {
      if (pick.name === "1X" || pick.name === "X2" || pick.name === "12") put(event.lines, dcKey(pick.name), pick.price);
    }
    return;
  }
  if (folded === "gg/ng" || folded === "goal/no goal") {
    for (const pick of picks) {
      if (pick.name === "GG") put(event.lines, BTTS_GG, pick.price);
      if (pick.name === "NG") put(event.lines, BTTS_NG, pick.price);
    }
    return;
  }
  if (folded === "u/o") {
    const marked = typeof market.ds === "number" ? market.ds : null;
    for (const pick of picks) {
      const line = lineNumber(pick.line);
      if (line == null) continue;
      if (pick.name !== "U" && pick.name !== "O") continue;
      put(event.lines, ouKey(line, pick.name === "O" ? "O" : "U"), pick.price);
      if (marked != null && Math.abs(marked - line) < 0.01) {
        event.totalLine = line;
        if (pick.name === "O") event.over = pick.price;
        if (pick.name === "U") event.under = pick.price;
      }
    }
    return;
  }
  if (folded === "multigol") {
    for (const pick of picks) {
      if (MODEL_BANDS.includes(pick.name as (typeof MODEL_BANDS)[number])) put(event.lines, mgKey(pick.name), pick.price);
    }
    return;
  }
  if (folded === "dc + u/o") {
    for (const pick of picks) {
      const side = pick.name.match(/^(1X|X2|12)-(Un|Ov)$/);
      const line = lineNumber(pick.line);
      if (!side || line == null) continue;
      const total = `${side[2] === "Ov" ? "Over" : "Under"} ${line.toFixed(1).replace(".", ",")}`;
      put(event.lines, comboKey(side[1] ?? "", total), pick.price);
    }
    return;
  }
  if (folded === "dc + gg/ng") {
    for (const pick of picks) {
      const side = pick.name.match(/^(1X|X2|12)-(GG|NG)$/);
      if (!side) continue;
      put(event.lines, comboKey(side[1] ?? "", side[2] === "GG" ? "Gol" : "No gol"), pick.price);
    }
    return;
  }
  if (folded === "gg/ng + u/o") {
    for (const pick of picks) {
      const side = pick.name.match(/^(GG|NG)-(Un|Ov)$/);
      const line = lineNumber(pick.line);
      if (!side || line == null) continue;
      const total = `${side[2] === "Ov" ? "Over" : "Under"} ${line.toFixed(1).replace(".", ",")}`;
      put(event.lines, comboKey(side[1] === "GG" ? "Gol" : "No gol", total), pick.price);
    }
    return;
  }
  const band = name.match(/^DC \+ Multigol (\d-\d)$/i);
  if (band && MODEL_BANDS.includes(band[1] as (typeof MODEL_BANDS)[number])) {
    for (const pick of picks) {
      const side = pick.name.match(/^(1X|X2|12) \+ (\d-\d) Gol$/);
      if (!side || side[2] !== band[1]) continue;
      put(event.lines, comboKey(side[1] ?? "", `Multigol ${side[2]}`), pick.price);
    }
  }
}

function detailUrl(eventId: number, tab: number): string {
  return `${SOURCE}/api/sport/pregame/getDetailsEvent/93/${eventId}/${tab}?channelId=1`;
}

/** Listino Serie A pubblico di Betflag. Nessuna chiave. Se un tab non risponde, gli altri restano. */
export async function loadBetflagPrices(): Promise<BetflagLoad> {
  const overview = await fetchJson(OVERVIEW, HEADERS);
  const events = absorbMarkets(overview);
  const failed: string[] = [];
  await pool(events, 4, async (event) => {
    for (const tab of EXTRA_TABS) {
      try {
        const payload = await fetchJson(detailUrl(event.eventId, tab), HEADERS);
        absorbMarkets(payload, event);
      } catch (error) {
        const message = error instanceof Error ? error.message : "errore";
        failed.push(`tab ${tab} evento ${event.eventId} (${message})`);
      }
    }
  });
  const withDc = events.filter((event) => event.lines[dcKey("1X")] || event.lines[dcKey("X2")] || event.lines[dcKey("12")]).length;
  const miss = failed.length ? ` Tab non letti: ${failed.slice(0, 6).join("; ")}.` : "";
  return {
    events,
    note: `Betflag, sportservice.betflag.it, senza chiave: ${events.length} partite, doppia chance su ${withDc}. Gol/no gol, under/over 1,5 2,5 3,5, multigol 1-3 e 2-4 se la pagina li mostra, e le doppie con lo stesso nome. La fascia 0-2 non è nel listino Multigol: resta dato assente. Non è SNAI.${miss}`,
  };
}
