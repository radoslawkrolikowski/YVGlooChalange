// Daily demo refresh — secured route from Step 23, activated in Step 31.
//
// Prunes anonymous-session data older than the previous refresh, re-dates the
// public demo circle's seeded content to today, and regenerates its starters,
// digest and lesson summary through real Gloo calls. Runs inside
// /api/cron/daily in production (Hobby-plan cron consolidation); this
// standalone route exists so the cadence can be triggered on its own.

import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { demoRefreshSweep } from "@/lib/cron-sweeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const result = await demoRefreshSweep();
  return NextResponse.json({ ok: true, results: [result] });
}
