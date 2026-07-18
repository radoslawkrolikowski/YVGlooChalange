import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { plans, userPlanProgress } from "@/db/schema";
import { remintAnonPlan } from "@/lib/anon-session";
import { loadAnonPlanState, loadUserPlanState } from "@/lib/plans";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 11: the session's active reading plan.
//
// GET returns the resolved PlanState (or state: null when no plan is
// selected). POST selects a plan: Path A upserts the private
// user_plan_progress row (one active plan per user — re-selecting replaces
// it and resets progress); Path B re-mints the signed anonymous token with
// the plan state, same mechanism as /api/session/preferences.

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
    await db
      .insert(userPlanProgress)
      .values({ userId: session.userId, planId })
      .onConflictDoUpdate({
        target: userPlanProgress.userId,
        set: { planId, startedAt: new Date(), completedDays: [] },
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
