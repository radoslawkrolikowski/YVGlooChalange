// Step 23: the 12-hourly cron slot Vercel Cron actually calls in production.
//
// It carries both 12-hourly cadences — the Health sweep (Step 23, stub until
// Step 34) and the Companion sweep (Step 24A) — the same consolidation the
// daily slot uses for its three cadences, because the Hobby plan allows only
// two cron jobs (see vercel.json). Each cadence remains a standalone secured
// route for individual triggering, and idempotency lives in agent_runs — so
// running a cadence here AND individually can never double-fire anything.
//
// The plan's cadence is 12-hourly with "-am"/"-pm" period keys; on the Hobby
// plan Vercel Cron is daily-only, so production fires the "-am" half once a day
// and the "-pm" half becomes reachable when the account upgrades — the
// period-key convention already supports both.

import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { companionSweep, healthSweep } from "@/lib/cron-sweeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  // Sequential on purpose: each sweep's claims are independent — one cadence
  // failing must not mask the other's results.
  const results = [await healthSweep(), await companionSweep()];
  return NextResponse.json({ ok: true, results });
}
