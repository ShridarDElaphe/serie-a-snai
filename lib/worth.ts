import { formatEuro, formatPct } from "./format";
import { THRESHOLDS } from "./thresholds";

export const STAKES_EURO = [1, 2] as const;

export type StakeVerdict = "manca" | "non-valida" | "irrisorio" | "atteso-negativo" | "senza-probabilita" | "conviene";

export type StakeJudgement = {
  verdict: StakeVerdict;
  conviene: boolean;
  headline: string;
  detail: string;
};

export function parseQuota(raw: string | null | undefined): { quota: number | null; invalid: boolean } {
  if (raw == null) return { quota: null, invalid: false };
  const text = raw.trim().replace(",", ".");
  if (!text) return { quota: null, invalid: false };
  const quota = Number(text);
  if (!Number.isFinite(quota) || quota <= 1 || quota >= 1000) return { quota: null, invalid: true };
  return { quota, invalid: false };
}

function profitSentence(quota: number): string {
  const parts = STAKES_EURO.map((stake) => `su €${stake} l'utile se vince è ${formatEuro((quota - 1) * stake)}`);
  return parts.join(" e ");
}

function expectedSentence(probability: number, quota: number): string {
  const parts = STAKES_EURO.map((stake) => `su €${stake} ${formatEuro(stake * (probability * quota - 1))}`);
  return `Utile atteso ${parts.join(", ")}.`;
}

export function judgeStake(
  probability: number | null,
  rawQuota: string | null | undefined,
  confidence?: "alta" | "media",
): StakeJudgement {
  const parsed = parseQuota(rawQuota);
  if (parsed.invalid) {
    return {
      verdict: "non-valida",
      conviene: false,
      headline: "Quota non valida.",
      detail: "Serve la quota decimale SNAI, maggiore di 1. Non ne invento una.",
    };
  }
  if (parsed.quota == null) {
    return {
      verdict: "manca",
      conviene: false,
      headline: "Quota mancante.",
      detail: "Non la chiamo conveniente finché non scrivi la quota SNAI. Il sito non la legge dal bookmaker.",
    };
  }
  const quota = parsed.quota;
  const profits = profitSentence(quota);
  const alta = confidence === "alta" || (probability != null && probability >= THRESHOLDS.dcMinPercent / 100);
  if (quota - 1 < THRESHOLDS.minProfitPerEuro) {
    const expected = probability == null ? "" : ` ${expectedSentence(probability, quota)}`;
    const lose = probability == null
      ? " Se la giocata salta perdi l'intera puntata."
      : ` Probabilità di perderla: ${formatPct(1 - probability)}. In quel caso perdi l'intera posta.`;
    return {
      verdict: "irrisorio",
      conviene: false,
      headline: alta ? "Probabilità alta, rendimento irrisorio." : "Rendimento irrisorio.",
      detail: `${profits}.${lose}${expected} Non conviene: l'utile è di pochi centesimi e non paga il rischio di perdere tutta la posta.`,
    };
  }
  if (probability == null) {
    return {
      verdict: "senza-probabilita",
      conviene: false,
      headline: "Non conviene.",
      detail: `${profits}. La probabilità numerica è dato assente, quindi non confronto il prezzo con il rischio di perderla.`,
    };
  }
  const expected = expectedSentence(probability, quota);
  const lose = `Probabilità di perderla: ${formatPct(1 - probability)}. In quel caso perdi l'intera posta.`;
  if (probability * quota - 1 < 0) {
    return {
      verdict: "atteso-negativo",
      conviene: false,
      headline: "Non conviene.",
      detail: `${profits}. ${lose} ${expected} Il valore atteso è negativo: la quota paga meno della probabilità stimata.`,
    };
  }
  return {
    verdict: "conviene",
    conviene: true,
    headline: "Conviene sul prezzo inserito.",
    detail: `${profits}. ${lose} ${expected} L'utile atteso è positivo e non è di pochi centesimi. Non è una vincita garantita.`,
  };
}
