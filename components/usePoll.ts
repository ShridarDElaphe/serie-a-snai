"use client";

import { useEffect, useState } from "react";

export function usePoll<T>(url: string, ms = 20000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const json = (await response.json()) as T;
        if (!stop) {
          setData(json);
          setError(false);
        }
      } catch {
        if (!stop) setError(true);
      }
    };
    void load();
    const timer = setInterval(load, ms);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [url, ms]);

  return { data, error };
}
