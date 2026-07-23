// Cron route plumbing (Step 23): bearer-secret verification and the period
// keys every scheduled sweep stamps into agent_runs.
//
// Vercel Cron calls each route with `Authorization: Bearer ${CRON_SECRET}`
// (the CRON_SECRET env var is read by Vercel automatically); the Agent
// Console's dev proxy constructs the same header server-side. Anything else
// gets a 401 — these routes trigger agent work and must never be publicly
// callable.

import { timingSafeEqual } from "node:crypto";

/** True when the request carries the exact CRON_SECRET bearer token. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed: an unset secret must not mean an open endpoint.
    return false;
  }
  const header = request.headers.get("authorization");
  if (!header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(header);
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

/** Daily period key, UTC: "2026-07-23". */
export function dailyPeriodKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** 12-hourly period key, UTC: "2026-07-23-am" / "2026-07-23-pm". */
export function halfDayPeriodKey(now: Date = new Date()): string {
  const half = now.getUTCHours() < 12 ? "am" : "pm";
  return `${dailyPeriodKey(now)}-${half}`;
}
