// Scheduled sweeps (Step 23) — the rail, not the trains.
//
// Each sweep enumerates its eligible targets and CLAIMS an agent_runs row per
// target (insert into the unique (agent_name, target_id, period_key) index —
// onConflictDoNothing). A claimed target reports "ran"; a conflict reports
// "already_ran" and nothing else happens. The agent work itself lands in
// later steps AFTER a successful claim: Facilitator+Summary in Step 24,
// Reminder delivery in Step 29, Health in Step 34, demo refresh in Step 31 —
// so in this step a sweep's only write is the claim row, which is exactly
// what makes the idempotency provable in isolation.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns, circles, userPlanProgress } from "@/db/schema";
import { dailyPeriodKey, halfDayPeriodKey } from "@/lib/cron";

export interface SweepTarget {
  targetId: string;
  status: "ran" | "already_ran";
}

export interface SweepResult {
  job: CronJobName;
  periodKey: string;
  targets: SweepTarget[];
  ran: number;
  alreadyRan: number;
  /** Set when the sweep is a stub or inactive — says what is still to come. */
  note?: string;
}

export type CronJobName =
  | "facilitator"
  | "reminder"
  | "health"
  | "demo-refresh";

/**
 * Claims agent_runs rows for every target: the first sweep of a period
 * inserts, any re-run hits the unique index and reports "already_ran".
 */
async function claimAll(
  job: CronJobName,
  periodKey: string,
  targetIds: string[],
): Promise<SweepTarget[]> {
  const targets: SweepTarget[] = [];
  for (const targetId of targetIds) {
    const claimed = await db
      .insert(agentRuns)
      .values({ agentName: job, targetId, periodKey })
      .onConflictDoNothing()
      .returning({ id: agentRuns.id });
    targets.push({
      targetId,
      status: claimed.length > 0 ? "ran" : "already_ran",
    });
  }
  return targets;
}

function summarise(
  job: CronJobName,
  periodKey: string,
  targets: SweepTarget[],
  note?: string,
): SweepResult {
  return {
    job,
    periodKey,
    targets,
    ran: targets.filter((target) => target.status === "ran").length,
    alreadyRan: targets.filter((target) => target.status === "already_ran")
      .length,
    ...(note ? { note } : {}),
  };
}

/**
 * Daily Facilitator+Summary sweep, per circle. Eligible: active circles —
 * a digest needs at least two members, and only active circles have them.
 * Step 24 adds the real work (reflection threshold, Gloo digest, thread post)
 * behind each successful claim.
 */
export async function facilitatorSweep(): Promise<SweepResult> {
  const periodKey = dailyPeriodKey();
  const eligible = await db
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.state, "active"));
  const targets = await claimAll(
    "facilitator",
    periodKey,
    eligible.map((circle) => circle.id),
  );
  return summarise(
    "facilitator",
    periodKey,
    targets,
    "Claims only in Step 23 — digest generation lands in Step 24.",
  );
}

/**
 * Daily Reminder sweep, per user. Eligible: users with an active reading
 * plan — the only users who can fall behind one. Step 29 adds the real work
 * (behind-schedule check, Gloo reminder, in-app + email delivery).
 */
export async function reminderSweep(): Promise<SweepResult> {
  const periodKey = dailyPeriodKey();
  const eligible = await db
    .select({ userId: userPlanProgress.userId })
    .from(userPlanProgress)
    .where(eq(userPlanProgress.isActive, true));
  const targets = await claimAll(
    "reminder",
    periodKey,
    eligible.map((row) => row.userId),
  );
  return summarise(
    "reminder",
    periodKey,
    targets,
    "Claims only in Step 23 — reminder generation lands in Step 29.",
  );
}

/**
 * 12-hourly Health sweep, per circle (stub — the Health Agent is a Tier 2
 * stub until Step 34). Eligible: active circles. Claims prove the cadence and
 * idempotency now; signal gathering and the agent call arrive with Step 34.
 */
export async function healthSweep(): Promise<SweepResult> {
  const periodKey = halfDayPeriodKey();
  const eligible = await db
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.state, "active"));
  const targets = await claimAll(
    "health",
    periodKey,
    eligible.map((circle) => circle.id),
  );
  return summarise(
    "health",
    periodKey,
    targets,
    "Health Agent is a stub — classification and actions land in Step 34.",
  );
}

/**
 * Daily demo refresh — inactive until Step 31 (no demo circle exists yet).
 * The secured route and cron slot exist now so Step 31 only fills in the
 * work; nothing is claimed here, so Step 31's first real run starts clean.
 */
export async function demoRefreshSweep(): Promise<SweepResult> {
  return summarise(
    "demo-refresh",
    dailyPeriodKey(),
    [],
    "Inactive until Step 31 — the demo circle does not exist yet.",
  );
}
