// Step 24A: 12-hourly Companion sweep, per active circle. In production this
// rides the 12-hourly cron slot alongside Health (see /api/cron/health and
// vercel.json — the Hobby plan allows only two cron jobs, so the 12-hourly
// slot carries both 12-hourly cadences, exactly as the daily slot carries the
// daily ones). This standalone route keeps the cadence individually
// triggerable from the Agent Console and curl.

import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { companionSweep } from "@/lib/cron-sweeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const result = await companionSweep();
  return NextResponse.json({ ok: true, results: [result] });
}
