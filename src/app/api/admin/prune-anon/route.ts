import { NextResponse } from "next/server";
import { pruneAnonSessionData, totalPruned } from "@/lib/anon-prune";
import { cronAuthorized } from "@/lib/cron";
import { devToolingEnabled } from "@/lib/dev-gate";

export const dynamic = "force-dynamic";

// Step 30A: delete anonymous-session data on demand, so the session-scoping
// this step introduced can be verified end to end before Step 31 puts the same
// helper on the daily cron rail. Authorized exactly like the demo seed route —
// the CRON_SECRET bearer, or any non-production environment so the dev Agent
// Console can call it. Never open to the public.
//
// POST { olderThanMinutes?: number } — defaults to 0, i.e. prune everything
// anonymous now (the demo-verification case). Step 31's sweep will pass its own
// cutoff, the previous refresh.
export async function POST(request: Request) {
  if (!cronAuthorized(request) && !devToolingEnabled()) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let olderThanMinutes = 0;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.olderThanMinutes === "number" && body.olderThanMinutes >= 0) {
      olderThanMinutes = body.olderThanMinutes;
    }
  } catch {
    // No body is the common case — keep the default cutoff.
  }

  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  try {
    const counts = await pruneAnonSessionData(cutoff);
    return NextResponse.json({
      ok: true,
      cutoff: cutoff.toISOString(),
      counts,
      total: totalPruned(counts),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Prune failed",
      },
      { status: 500 },
    );
  }
}
