// Step 23: daily demo refresh — secured route and cron slot exist now,
// activated in Step 31 when the demo circle lands. Runs inside
// /api/cron/daily in production (Hobby-plan cron consolidation).

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
