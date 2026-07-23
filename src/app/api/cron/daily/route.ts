// Step 23: the combined daily sweep Vercel Cron actually calls in production.
//
// The Hobby plan allows at most 2 cron jobs, daily-only, so the three daily
// cadences (Facilitator+Summary per circle, Reminder per user, demo refresh)
// are consolidated behind this one dispatcher; the 12-hourly Health sweep
// keeps the second cron slot (see vercel.json). Each cadence remains a
// standalone secured route for individual triggering, and idempotency lives
// in agent_runs — so running a cadence here AND individually can never
// double-fire anything.

import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import {
  demoRefreshSweep,
  facilitatorSweep,
  reminderSweep,
} from "@/lib/cron-sweeps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  // Sequential on purpose: predictable ordering, and each sweep's claims are
  // independent — one cadence failing must not mask the others' results.
  const results = [
    await facilitatorSweep(),
    await reminderSweep(),
    await demoRefreshSweep(),
  ];
  return NextResponse.json({ ok: true, results });
}
