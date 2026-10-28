import { metaGet, metaSet } from "../db";

type Probe = { name: string; url: string; kind: "api" | "pagina"; keyEnv?: string[] };

const PROBES: Probe[] = [
  {
    name: "The Odds API",
    url: "https://api.the-odds-api.com/v4/sports/soccer_italy_serie_a/odds?regions=eu&markets=h2h,totals&oddsFormat=decimal",
    kind: "api",
    keyEnv: ["THE_ODDS_API_KEY", "ODDS_API_KEY"],
  },
  {
    name: "OddsPapi",
    url: "https://api.oddspapi.io/v4/odds?sportId=10",
    kind: "api",
    keyEnv: ["ODDSPAPI_API_KEY", "ODDSPAPI_KEY"],
  },
  {
    name: "API-Football",
    url: "https://v3.football.api-sports.io/odds?league=135&season=2026",
    kind: "api",
    keyEnv: ["API_FOOTBALL_KEY", "APISPORTS_KEY"],
  },
  {
    name: "football-data.org",
    url: "https://api.football-data.org/v4/competitions/SA/matches?status=SCHEDULED",
    kind: "api",
    keyEnv: ["FOOTBALL_DATA_API_KEY"],
  },
  { name: "Eurobet pronostici", url: "https://www.eurobet.it/it/pronostici/serie-a/", kind: "pagina" },
  {
    name: "Commenti e Recensioni",
    url: "https://scommesse.commentierecensioni.com/pronostici-serie-a-9a-giornata-2026-27/",
    kind: "pagina",
  },
  {
    name: "FC Inter 1908",
    url: "https://www.fcinter1908.it/pronostici/schedina-serie-a-9a-giornata-pronostici-e-quote/",
    kind: "pagina",
  },
  {
    name: "L'Angolo dei Pronostici",
    url: "https://langolodeipronostici.com/2026/10/28/pronostici-di-serie-a-9-giornata-milan-bologna-parma-udinese-e-venezia-inter-18-30-genoa-juventus-e-monza-napoli-20-45-mercoledi-28-ottobre/",
    kind: "pagina",
  },
  {
    name: "Le Bombe di Vlad",
    url: "https://www.lebombedivlad.it/2026/10/27/pronostici-serie-a-9a-giornata-le-nostre-scelte-e-perche/",
    kind: "pagina",
  },
  {
    name: "Eurosport",
    url: "https://www.eurosport.it/calcio/serie-a/2026-2027/probabili-formazioni-8a-giornata-serie-a-202627-titolari-indisponibili-squalificati-consigli-dubbi-ultime-sulle-scelte-in-ottica-fantacalcio_sto23349514/story.shtml",
    kind: "pagina",
  },
  {
    name: "askanews",
    url: "https://askanews.it/2026/10/27/calcio-la-classifica-di-serie-a-lazio-in-minifuga-la-roma-e-li/",
    kind: "pagina",
  },
  {
    name: "Calciomercato.com",
    url: "https://calciomercato.com/notizie/streaming-online-tv-dove-guardare-milan-v-bologna/bltc78c931849614d2c",
    kind: "pagina",
  },
];

function keyFor(names: string[] | undefined): string | null {
  if (!names) return null;
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function hasPriceField(body: string): boolean {
  return /"offers"|"price"|application\/ld\+json[\s\S]{0,400}"odds"/i.test(body);
}

async function one(probe: Probe): Promise<string> {
  const key = keyFor(probe.keyEnv);
  if (probe.kind === "api" && probe.keyEnv && !key) {
    return `${probe.name}: chiave assente (${probe.keyEnv[0]}). Quota di questa fonte: dato assente.`;
  }
  const headers: Record<string, string> = {};
  let url = probe.url;
  if (key && probe.name === "The Odds API") url = `${probe.url}&apiKey=${encodeURIComponent(key)}`;
  if (key && probe.name === "OddsPapi") url = `${probe.url}&apiKey=${encodeURIComponent(key)}`;
  if (key && probe.name === "API-Football") headers["x-apisports-key"] = key;
  if (key && probe.name === "football-data.org") headers["X-Auth-Token"] = key;
  try {
    const response = await fetch(url, {
      headers: { Accept: probe.kind === "api" ? "application/json" : "text/html", "User-Agent": "MargineSerieA/0.1", ...headers },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
      redirect: "follow",
    });
    if (probe.kind === "api") {
      if (response.status === 401 || response.status === 403) {
        return `${probe.name}: HTTP ${response.status}. Quota: dato assente.`;
      }
      if (!response.ok) return `${probe.name}: HTTP ${response.status}. Quota: dato assente.`;
      return `${probe.name}: HTTP ${response.status}, risposta ricevuta.`;
    }
    const body = response.ok ? (await response.text()).slice(0, 80_000) : "";
    if (!response.ok) return `${probe.name}: HTTP ${response.status}. Non usata come numero. Quota: dato assente.`;
    if (hasPriceField(body)) return `${probe.name}: HTTP 200, ma il prezzo non è un campo quota stabile. Numero: dato assente.`;
    return `${probe.name}: HTTP 200, pagina senza campo quota. Numero: dato assente.`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "errore";
    return `${probe.name}: non raggiungibile (${message}). Quota: dato assente.`;
  }
}

/** Interroga le fonti quote del metodo. Non legge numeri dalle pagine: se non c'è un'API, il numero resta assente. */
export async function probeQuoteSources(force = false): Promise<string[]> {
  const at = metaGet("quote_probe_at");
  const cached = metaGet("quote_probe");
  if (!force && cached && at && Date.now() - Date.parse(at) < 6 * 3_600_000) {
    try {
      return JSON.parse(cached) as string[];
    } catch {
      /* ricalcola */
    }
  }
  const notes = await Promise.all(PROBES.map((probe) => one(probe)));
  notes.unshift("Quote usate, se presenti: DraftKings nel tabellone ESPN. Non sono quote SNAI.");
  metaSet("quote_probe_at", new Date().toISOString());
  metaSet("quote_probe", JSON.stringify(notes));
  return notes;
}

export function cachedQuoteNotes(): string[] {
  const raw = metaGet("quote_probe");
  if (!raw) return ["Fonti quote non ancora interrogate. I numeri mancanti restano dato assente."];
  try {
    const notes = JSON.parse(raw) as string[];
    return notes.length ? notes : ["Fonti quote non ancora interrogate."];
  } catch {
    return ["Fonti quote non ancora interrogate."];
  }
}

export function quoteNoteSentence(): string {
  return "The Odds API, OddsPapi, API-Football e football-data.org senza chiave, e le pagine di pronostici senza un campo quota, restano dato assente. Non invento il numero.";
}
