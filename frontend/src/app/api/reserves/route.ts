// Phase 1 scaffold — full implementation in Phase 6 (T061).
// Server-side Route Handler that batches read calls against a single RPC for portfolio perf (SC-004).
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pair = searchParams.get("pair");
  const account = searchParams.get("account");

  if (!pair || !account) {
    return NextResponse.json({ error: "missing pair or account" }, { status: 400 });
  }

  // T061 implementation reads via JsonRpcProvider; this Phase 1 stub returns 501.
  return NextResponse.json(
    { error: "not_implemented", phase: 1, pair, account },
    { status: 501 }
  );
}
