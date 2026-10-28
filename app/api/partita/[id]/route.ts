import { NextResponse } from "next/server";
import { ensureData, startRefreshLoop } from "@/lib/ingest/refresh";
import { readPartita } from "@/lib/read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  startRefreshLoop();
  await ensureData();
  const { id } = await context.params;
  return NextResponse.json(readPartita(id));
}
