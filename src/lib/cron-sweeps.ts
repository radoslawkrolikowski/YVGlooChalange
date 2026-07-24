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

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns, circles, userPlanProgress } from "@/db/schema";
import { dailyPeriodKey, halfDayPeriodKey } from "@/lib/cron";
import { runCircleCompanion } from "@/lib/companion";
import { runCircleDigest } from "@/lib/digest";
import { runUserReminders } from "@/lib/reminders";

export interface SweepTarget {
  targetId: string;
  status: "ran" | "already_ran";
  /** What the run actually did for this target — e.g. "digest posted for
   * Psalm 23", "below threshold (1/3, need 2)". Shown inline in the console. */
  detail?: string;
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
  | "companion"
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
 * Daily Facilitator sweep, per circle. Eligible: active circles — a digest
 * needs at least two members, and only active circles have them.
 *
 * Per circle, claim the agent_runs row (the first idempotency fence); on a
 * successful claim run the digest (Step 24) — resolve the current plan day,
 * count distinct reflection authors against the threshold, and, if met, generate
 * and post the digest. A conflicting claim reports "already_ran" and does
 * nothing. A generation error releases the claim so a later sweep retries; the
 * digests (circle, day) unique index is the second fence that keeps a retry from
 * ever duplicating. (The Summary agent, Step 25, will run in this same claim.)
 */
export async function facilitatorSweep(): Promise<SweepResult> {
  const periodKey = dailyPeriodKey();
  const eligible = await db
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.state, "active"));

  const targets: SweepTarget[] = [];
  for (const circle of eligible) {
    const [claim] = await db
      .insert(agentRuns)
      .values({ agentName: "facilitator", targetId: circle.id, periodKey })
      .onConflictDoNothing()
      .returning({ id: agentRuns.id });
    if (!claim) {
      targets.push({ targetId: circle.id, status: "already_ran" });
      continue;
    }

    const outcome = await runCircleDigest(circle.id);
    if (!outcome.posted && outcome.reason === "error") {
      // Release the claim so a later sweep can retry this circle's digest.
      await db
        .delete(agentRuns)
        .where(
          and(
            eq(agentRuns.agentName, "facilitator"),
            eq(agentRuns.targetId, circle.id),
            eq(agentRuns.periodKey, periodKey),
          ),
        )
        .catch(() => {
          // Keep the claim if the release fails — no digest, but no crash.
        });
    }
    targets.push({ targetId: circle.id, status: "ran", detail: outcome.detail });
  }

  return summarise("facilitator", periodKey, targets);
}

/**
 * Daily Reminder sweep, per user (Step 29). Eligible: users with an active
 * reading plan — the only users who can fall behind one (a user with no plan but
 * a stalled circle still can't fall "behind", and a message reminder without a
 * plan is a rare edge not worth sweeping every user for).
 *
 * Per user, claim the agent_runs row (the first idempotency fence); on a
 * successful claim run both reminder types and deliver any that are due to the
 * notification bell (Gloo generation + in-app insert, no email). A conflicting
 * claim reports "already_ran" and does nothing. A generation error releases the
 * claim so a later sweep retries; the notifications (user, type, day) unique
 * index is the second fence that keeps a retry from ever duplicating a delivered
 * reminder.
 */
export async function reminderSweep(): Promise<SweepResult> {
  const periodKey = dailyPeriodKey();
  const eligible = await db
    .select({ userId: userPlanProgress.userId })
    .from(userPlanProgress)
    .where(eq(userPlanProgress.isActive, true));

  const targets: SweepTarget[] = [];
  for (const { userId } of eligible) {
    const [claim] = await db
      .insert(agentRuns)
      .values({ agentName: "reminder", targetId: userId, periodKey })
      .onConflictDoNothing()
      .returning({ id: agentRuns.id });
    if (!claim) {
      targets.push({ targetId: userId, status: "already_ran" });
      continue;
    }

    const outcome = await runUserReminders(userId, periodKey);
    if (outcome.errored) {
      // Release the claim so a later sweep can retry this user's reminders.
      await db
        .delete(agentRuns)
        .where(
          and(
            eq(agentRuns.agentName, "reminder"),
            eq(agentRuns.targetId, userId),
            eq(agentRuns.periodKey, periodKey),
          ),
        )
        .catch(() => {
          // Keep the claim if the release fails — no retry, but no crash.
        });
    }
    targets.push({ targetId: userId, status: "ran", detail: outcome.detail });
  }

  return summarise("reminder", periodKey, targets);
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
 * 12-hourly Companion sweep, per active circle (Step 24A) — the digest's
 * inverse, revives a stalled day. Eligible: active circles (a conversation
 * needs members). Per circle, claim the agent_runs row (period key
 * "2026-07-23-am"/"-pm") — the first idempotency fence, so Round takes at most
 * one turn per sweep and a re-run spends no Gloo call. On a successful claim run
 * the Companion (resolve the current plan day, check the eligibility gates,
 * screen the thread Escalation-first, generate and post the turn). A conflicting
 * claim reports "already_ran" and does nothing. A generation/screening error
 * releases the claim so a later sweep retries; an eligibility no-op or a
 * crisis-silence keeps the claim (that decision is final for the period).
 */
export async function companionSweep(): Promise<SweepResult> {
  const periodKey = halfDayPeriodKey();
  const eligible = await db
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.state, "active"));

  const targets: SweepTarget[] = [];
  for (const circle of eligible) {
    const [claim] = await db
      .insert(agentRuns)
      .values({ agentName: "companion", targetId: circle.id, periodKey })
      .onConflictDoNothing()
      .returning({ id: agentRuns.id });
    if (!claim) {
      targets.push({ targetId: circle.id, status: "already_ran" });
      continue;
    }

    const outcome = await runCircleCompanion(circle.id);
    if (!outcome.posted && outcome.reason === "error") {
      // Release the claim so a later sweep can retry this circle.
      await db
        .delete(agentRuns)
        .where(
          and(
            eq(agentRuns.agentName, "companion"),
            eq(agentRuns.targetId, circle.id),
            eq(agentRuns.periodKey, periodKey),
          ),
        )
        .catch(() => {
          // Keep the claim if the release fails — no turn, but no crash.
        });
    }
    targets.push({ targetId: circle.id, status: "ran", detail: outcome.detail });
  }

  return summarise("companion", periodKey, targets);
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
