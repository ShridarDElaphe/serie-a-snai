export async function fetchText(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "MargineSerieA/0.1 (personal research)",
      Accept: "*/*",
      ...headers,
    },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  return { status: response.status, body: await response.text() };
}

export async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const { status, body } = await fetchText(url, { Accept: "application/json", ...headers });
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status} su ${url}`);
  }
  return JSON.parse(body) as unknown;
}

export async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  if (!items.length) return;
  let index = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(runners);
}
