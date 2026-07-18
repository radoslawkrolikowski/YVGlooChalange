// Reading plan queries and progress resolution — Step 11.
//
// One module answers "what plan is this session on, and what is today's
// reading?" for both paths: Path A reads the user_plan_progress row, Path B
// reads the plan state carried in the signed anonymous token. Both resolve
// through the same PlanState shape so every screen renders identically.

import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { planDays, plans, userPlanProgress } from "@/db/schema";
import type { AnonPlanState } from "@/lib/anon-session";

export interface PlanSummary {
  id: string;
  name: string;
  description: string;
  lengthDays: number;
}

export interface PlanDay {
  dayNumber: number;
  /** USFM reference, e.g. "PSA.23" — what fetchPassage takes (Step 13). */
  reference: string;
  /** Human-readable label, e.g. "Psalm 23". */
  label: string;
}

/** The session's active plan resolved for display. Progress is private. */
export interface PlanState {
  plan: PlanSummary;
  days: PlanDay[];
  /** 1-based; the first day not yet completed (last day once all are). */
  currentDay: number;
  completedDays: number[];
  /** Today's reading — the current day's row, for the Home Today card. */
  today: PlanDay;
}

/** The plan library, longest plan first (seed rows share a created_at). */
export async function listPlans(): Promise<PlanSummary[]> {
  return db
    .select({
      id: plans.id,
      name: plans.name,
      description: plans.description,
      lengthDays: plans.lengthDays,
    })
    .from(plans)
    .orderBy(desc(plans.lengthDays), asc(plans.id));
}

/** First day not yet completed; the last day once everything is complete. */
export function currentDayNumber(
  lengthDays: number,
  completedDays: number[],
): number {
  const done = new Set(completedDays);
  for (let day = 1; day <= lengthDays; day++) {
    if (!done.has(day)) return day;
  }
  return lengthDays;
}

async function buildPlanState(
  planId: string,
  completedDays: number[],
): Promise<PlanState | null> {
  const [plan] = await db
    .select({
      id: plans.id,
      name: plans.name,
      description: plans.description,
      lengthDays: plans.lengthDays,
    })
    .from(plans)
    .where(eq(plans.id, planId));
  if (!plan) return null;

  const days = await db
    .select({
      dayNumber: planDays.dayNumber,
      reference: planDays.reference,
      label: planDays.label,
    })
    .from(planDays)
    .where(eq(planDays.planId, planId))
    .orderBy(asc(planDays.dayNumber));
  if (days.length === 0) return null;

  const currentDay = currentDayNumber(plan.lengthDays, completedDays);
  const today = days.find((day) => day.dayNumber === currentDay) ?? days[0];

  return { plan, days, currentDay, completedDays, today };
}

/** Path A: resolve the signed-in user's active plan, or null when unset. */
export async function loadUserPlanState(
  userId: string,
): Promise<PlanState | null> {
  const [progress] = await db
    .select({
      planId: userPlanProgress.planId,
      completedDays: userPlanProgress.completedDays,
    })
    .from(userPlanProgress)
    .where(eq(userPlanProgress.userId, userId));
  if (!progress) return null;
  return buildPlanState(progress.planId, progress.completedDays);
}

/**
 * Path B: resolve the plan carried in the anonymous token. Null when the
 * token references a plan that no longer exists (e.g. stale session).
 */
export async function loadAnonPlanState(
  anonPlan: AnonPlanState | null,
): Promise<PlanState | null> {
  if (!anonPlan) return null;
  return buildPlanState(anonPlan.planId, anonPlan.completedDays);
}
