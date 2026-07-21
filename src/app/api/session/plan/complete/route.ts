import { and, eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/db";
import { plans, userPlanProgress } from "@/db/schema";
import { remintAnonDayComplete } from "@/lib/anon-session";
import { loadUserCircle } from "@/lib/circles";
import { postConversationStarters } from "@/lib/post-reading";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 14: "Finished reading" — mark one plan day complete.
//
// POST { dayNumber } advances private progress on the session's ACTIVE plan:
// Path A appends the day to the active user_plan_progress row's
// completed_days (Step 12A shape — paused rows are never touched); Path B
// re-mints the signed anonymous token with the day added. Idempotent on both
// paths: completing an already-completed day changes nothing. Progress is
// private to this session — nothing here is readable by any other member.

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

  const dayNumber = body.dayNumber;
  if (!Number.isInteger(dayNumber) || (dayNumber as number) < 1) {
    return NextResponse.json(
      { ok: false, error: "dayNumber must be a positive integer" },
      { status: 400 },
    );
  }
  const day = dayNumber as number;

  if (session.kind === "user") {
    const [progress] = await db
      .select({
        planId: userPlanProgress.planId,
        completedDays: userPlanProgress.completedDays,
        lengthDays: plans.lengthDays,
      })
      .from(userPlanProgress)
      .innerJoin(plans, eq(plans.id, userPlanProgress.planId))
      .where(
        and(
          eq(userPlanProgress.userId, session.userId),
          eq(userPlanProgress.isActive, true),
        ),
      );
    if (!progress) {
      return NextResponse.json(
        { ok: false, error: "No active reading plan" },
        { status: 404 },
      );
    }
    if (day > progress.lengthDays) {
      return NextResponse.json(
        { ok: false, error: "dayNumber is beyond the end of the plan" },
        { status: 400 },
      );
    }

    if (!progress.completedDays.includes(day)) {
      const completedDays = [...progress.completedDays, day].sort(
        (a, b) => a - b,
      );
      // Guarded by is_active so a concurrent plan switch can't resurrect
      // progress onto a row that was just paused.
      await db
        .update(userPlanProgress)
        .set({ completedDays })
        .where(
          and(
            eq(userPlanProgress.userId, session.userId),
            eq(userPlanProgress.planId, progress.planId),
            eq(userPlanProgress.isActive, true),
          ),
        );
    }

    // Step 20: finishing a reading gives the circle something to talk about.
    // Runs AFTER the response so the button never waits on a Gloo call — the
    // thread's 10-second poll delivers the starters. Idempotent per
    // user+circle+plan day, so a re-completed day posts nothing a second time.
    after(async () => {
      const circle = await loadUserCircle(session.userId);
      if (!circle || circle.planId !== progress.planId) return;
      await postConversationStarters({
        userId: session.userId,
        circleId: circle.id,
        dayNumber: day,
        language: session.language ?? "en",
        bibleVersionId: session.bibleVersionId,
      });
    });

    return NextResponse.json({ ok: true });
  }

  // Path B: progress lives in the signed token only — re-mint it.
  if (!session.plan) {
    return NextResponse.json(
      { ok: false, error: "No active reading plan" },
      { status: 404 },
    );
  }
  const [plan] = await db
    .select({ lengthDays: plans.lengthDays })
    .from(plans)
    .where(eq(plans.id, session.plan.planId));
  if (plan && day > plan.lengthDays) {
    return NextResponse.json(
      { ok: false, error: "dayNumber is beyond the end of the plan" },
      { status: 400 },
    );
  }

  const reminted = remintAnonDayComplete(session, day);
  if (!reminted) {
    return NextResponse.json(
      { ok: false, error: "No active reading plan" },
      { status: 404 },
    );
  }
  return NextResponse.json({
    ok: true,
    token: reminted.token,
    session: reminted.session,
  });
}
