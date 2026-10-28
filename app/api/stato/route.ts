import { NextResponse } from "next/server";
import { ensureData, startRefreshLoop } from "@/lib/ingest/refresh";
import { readStato } from "@/lib/read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  startRefreshLoop();
  await ensureData();
  return NextResponse.json(readStato());
}
