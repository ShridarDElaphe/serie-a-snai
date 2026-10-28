export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

const ALIAS_ROWS: { keys: string[]; aliases: string[] }[] = [
  { keys: ["lazio"], aliases: ["lazio", "biancocelesti"] },
  { keys: ["internazionale", "inter"], aliases: ["internazionale", "inter", "nerazzurri"] },
  { keys: ["roma"], aliases: ["as roma", "roma", "giallorossi", "trigoria"] },
  { keys: ["como"], aliases: ["como"] },
  { keys: ["milan"], aliases: ["ac milan", "milan", "rossoneri"] },
  { keys: ["frosinone"], aliases: ["frosinone", "ciociari"] },
  { keys: ["juventus"], aliases: ["juventus", "juve", "bianconeri"] },
  { keys: ["torino"], aliases: ["torino", "granata"] },
  { keys: ["cagliari"], aliases: ["cagliari"] },
  { keys: ["napoli"], aliases: ["napoli", "partenopei"] },
  { keys: ["atalanta"], aliases: ["atalanta", "orobici"] },
  { keys: ["lecce"], aliases: ["lecce", "salentini"] },
  { keys: ["bologna"], aliases: ["bologna", "rossoblu", "felsinei"] },
  { keys: ["sassuolo"], aliases: ["sassuolo", "neroverdi"] },
  { keys: ["monza"], aliases: ["monza"] },
  { keys: ["genoa"], aliases: ["genoa", "grifone"] },
  { keys: ["udinese"], aliases: ["udinese"] },
  { keys: ["fiorentina"], aliases: ["fiorentina", "viola"] },
  { keys: ["parma"], aliases: ["parma", "crociati"] },
  { keys: ["venezia"], aliases: ["venezia", "lagunari"] },
];

const ITALIAN_BY_KEY: { keys: string[]; name: string }[] = [
  { keys: ["internazionale", "inter"], name: "Inter" },
  { keys: ["ac milan", "milan"], name: "Milan" },
  { keys: ["as roma", "roma"], name: "Roma" },
  { keys: ["juventus"], name: "Juventus" },
  { keys: ["napoli"], name: "Napoli" },
  { keys: ["lazio"], name: "Lazio" },
  { keys: ["atalanta"], name: "Atalanta" },
  { keys: ["fiorentina"], name: "Fiorentina" },
  { keys: ["bologna"], name: "Bologna" },
  { keys: ["torino"], name: "Torino" },
  { keys: ["udinese"], name: "Udinese" },
  { keys: ["lecce"], name: "Lecce" },
  { keys: ["parma"], name: "Parma" },
  { keys: ["genoa"], name: "Genoa" },
  { keys: ["cagliari"], name: "Cagliari" },
  { keys: ["sassuolo"], name: "Sassuolo" },
  { keys: ["monza"], name: "Monza" },
  { keys: ["venezia"], name: "Venezia" },
  { keys: ["como"], name: "Como" },
  { keys: ["frosinone"], name: "Frosinone" },
];

export function italianName(raw: string): string {
  const n = fold(raw);
  const row = ITALIAN_BY_KEY.find((item) => item.keys.some((key) => n.includes(key)));
  return row?.name ?? raw;
}

export function aliasesForName(raw: string): string[] {
  const n = fold(raw);
  const row = ALIAS_ROWS.find((item) => item.keys.some((key) => n.includes(key)));
  const aliases = row?.aliases ?? [n];
  return [...new Set(aliases.map(fold))];
}

export function mentionsAlias(text: string, alias: string): boolean {
  let folded = fold(text);
  const needle = fold(alias);
  if (!needle) return false;
  if (needle === "inter") folded = folded.replace(/inter miami/g, " ");
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(folded);
}

export function lastName(full: string): string | null {
  const parts = full.split(/\s+/).map((part) => part.replace(/[.'’]/g, "")).filter(Boolean);
  const last = parts.at(-1);
  if (!last || fold(last).length < 4) return null;
  return last;
}

const FOOTBALL_CONTEXT =
  /serie a|calcio|formazione|squalif|infortun|convocat|difensore|attaccante|portiere|panchina|turnover|champions|coppa italia|marcatore|ammoniz|partita|giornata/;

export function teamsMentioned(
  text: string,
  teams: { id: string; name: string }[],
  kind: "seriea" | "general",
): string[] {
  const ids: string[] = [];
  for (const team of teams) {
    const aliases = aliasesForName(team.name);
    if (aliases.some((alias) => mentionsAlias(text, alias))) ids.push(team.id);
  }
  if (!ids.length) return [];
  if (kind === "general") {
    const football = FOOTBALL_CONTEXT.test(fold(text)) || ids.length >= 2;
    if (!football) return [];
  }
  return ids;
}
