// Step 23: daily Reminder sweep, per user. In production this runs inside
// /api/cron/daily (Hobby-plan cron consolidation — see vercel.json); this
// standalone route keeps the cadence individually triggerable from the Agent
// Console and curl.

import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { reminderSweep } from "@/lib/cron-sweeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const result = await reminderSweep();
  return NextResponse.json({ ok: true, results: [result] });
}
