import { DATO_ASSENTE } from "./thresholds";

export function formatKick(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DATO_ASSENTE;
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatClock(iso: string | null): string {
  if (!iso) return DATO_ASSENTE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DATO_ASSENTE;
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function percent(p: number): number {
  return Math.round(p * 100);
}

export function formatPct(p: number): string {
  return `${percent(p)}%`;
}

export function formatNum(n: number, digits = 1): string {
  return n.toFixed(digits).replace(".", ",");
}

export function formatEuro(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  return `${sign}€${Math.abs(amount).toFixed(2).replace(".", ",")}`;
}

export function formatInt(n: number): string {
  return new Intl.NumberFormat("it-IT").format(n);
}

export function orDato(value: string | number | null | undefined): string {
  if (value == null || value === "") return DATO_ASSENTE;
  return String(value);
}
