export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRefreshLoop } = await import("./lib/ingest/refresh");
    startRefreshLoop();
  }
}
