// Step 23: Health sweep, per circle (stub until Step 34). The plan's cadence
// is 12-hourly with "-am"/"-pm" period keys; on the Hobby plan Vercel Cron is
// daily-only, so production fires the "-am" half once a day (vercel.json) and
// the "-pm" half becomes reachable when the account upgrades — the period-key
// convention already supports both.

import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { healthSweep } from "@/lib/cron-sweeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const result = await healthSweep();
  return NextResponse.json({ ok: true, results: [result] });
}
