"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "margine-quote";

let quotes: Record<string, string> = {};
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      quotes = Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      );
    }
  } catch {
    quotes = {};
  }
}

function publish() {
  listeners.forEach((listener) => listener());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
  } catch {
    /* la quota resta solo in questa pagina */
  }
}

export function setQuote(id: string, value: string) {
  hydrate();
  const next = { ...quotes };
  if (value.trim() === "") delete next[id];
  else next[id] = value;
  quotes = next;
  publish();
}

export function useQuotes(): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    hydrate();
    setMap(quotes);
    const listener = () => setMap(quotes);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return map;
}
