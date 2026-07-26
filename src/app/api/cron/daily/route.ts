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
  //
  // The demo refresh goes FIRST (Step 31). It deletes the demo circle's digest
  // before regenerating it, so running the Facilitator afterwards is a free
  // safety net: in the ordinary case the fresh digest already holds the
  // (circle, day) claim and the Facilitator no-ops without spending a Gloo
  // call, and in the rare case the regeneration failed the Facilitator posts
  // the day's digest instead — the demo circle is never left without one.
  const results = [
    await demoRefreshSweep(),
    await facilitatorSweep(),
    await reminderSweep(),
  ];
  return NextResponse.json({ ok: true, results });
}
