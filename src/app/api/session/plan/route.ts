import { and, eq, not } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { plans, userPlanProgress } from "@/db/schema";
import { remintAnonPlan } from "@/lib/anon-session";
import { loadAnonPlanState, loadUserPlanState } from "@/lib/plans";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 11 (+12A): the session's active reading plan.
//
// GET returns the resolved PlanState (or state: null when no plan is
// selected). POST selects a plan: Path A pauses the current active
// user_plan_progress row and activates a row for the chosen plan — an
// existing paused row resumes with its completed_days intact, a first-time
// choice inserts a fresh row; progress is never reset. Path B re-mints the
// signed anonymous token with the plan state, same mechanism as
// /api/session/preferences.

export async function GET(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }

  const state =
    session.kind === "user"
      ? await loadUserPlanState(session.userId)
      : await loadAnonPlanState(session.plan);
  return NextResponse.json({ ok: true, state });
}

export async function POST(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const planId = body.planId;
  if (typeof planId !== "string" || planId.length === 0) {
    return NextResponse.json(
      { ok: false, error: "planId is required" },
      { status: 400 },
    );
  }

  const [plan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.id, planId));
  if (!plan) {
    return NextResponse.json(
      { ok: false, error: "Unknown plan" },
      { status: 404 },
    );
  }

  if (session.kind === "user") {
    // Pause first, then activate: the partial unique index allows only one
    // active row per user, so the order matters (the Neon HTTP driver has
    // no interactive transactions). If the second statement failed the user
    // would briefly have no active plan — recoverable by re-selecting.
    await db
      .update(userPlanProgress)
      .set({ isActive: false })
      .where(
        and(
          eq(userPlanProgress.userId, session.userId),
          not(eq(userPlanProgress.planId, planId)),
        ),
      );
    await db
      .insert(userPlanProgress)
      .values({ userId: session.userId, planId, isActive: true })
      .onConflictDoUpdate({
        target: [userPlanProgress.userId, userPlanProgress.planId],
        // Resuming a paused plan: reactivate only — completed_days and
        // started_at survive, per Step 12A.
        set: { isActive: true },
      });
    return NextResponse.json({ ok: true });
  }

  const reminted = remintAnonPlan(session, planId);
  return NextResponse.json({
    ok: true,
    token: reminted.token,
    session: reminted.session,
  });
}
