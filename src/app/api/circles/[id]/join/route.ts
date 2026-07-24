import { and, eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/db";
import {
  circleMembers,
  circles,
  plans,
  userPlanProgress,
} from "@/db/schema";
import {
  alignActivePlan,
  CIRCLE_KIND_PUBLIC,
  MAX_MEMBERS,
  MIN_MEMBERS,
  memberCount,
  userHasCircle,
} from "@/lib/circles";
import { postIcebreaker } from "@/lib/icebreaker";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 16: join an open circle (Path A only).
//
// Joining aligns the member's reading to the circle's attached plan. If the
// joiner's active plan differs, the first call returns `reason: "plan_switch"`
// with the circle's plan name so the client can show the explicit prompt
// ("This circle reads … — switch your reading?"); the client re-POSTs with
// `confirmPlanSwitch: true` to proceed. Declining simply never calls again, so
// the join is cancelled with the plan untouched — never a silent swap.
//
// The circle flips forming → active the moment it reaches MIN_MEMBERS; a join
// at MAX_MEMBERS is refused with a friendly `reason: "full"`.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }
  if (session.kind !== "user") {
    return NextResponse.json(
      { ok: false, error: "Circles require a YouVersion account" },
      { status: 403 },
    );
  }

  const { id: circleId } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // A confirm-less join sends no body — that is fine.
  }
  const confirmPlanSwitch = body.confirmPlanSwitch === true;

  // One circle per user in Step 16.
  if (await userHasCircle(session.userId)) {
    return NextResponse.json(
      { ok: false, reason: "already_member", error: "You are already in a circle" },
      { status: 409 },
    );
  }

  const [circle] = await db
    .select({
      id: circles.id,
      state: circles.state,
      kind: circles.kind,
      planId: circles.planId,
      planName: plans.name,
    })
    .from(circles)
    .innerJoin(plans, eq(plans.id, circles.planId))
    .where(eq(circles.id, circleId));
  if (!circle) {
    return NextResponse.json(
      { ok: false, error: "Circle not found" },
      { status: 404 },
    );
  }
  if (circle.state !== "forming" && circle.state !== "active") {
    return NextResponse.json(
      { ok: false, reason: "closed", error: "This circle is no longer open" },
      { status: 409 },
    );
  }

  // The public demo circle (Step 30) is unbounded — the five-member cap is a
  // small-circle rule that does not apply to it.
  const count = await memberCount(circle.id);
  if (circle.kind !== CIRCLE_KIND_PUBLIC && count >= MAX_MEMBERS) {
    return NextResponse.json(
      { ok: false, reason: "full", error: "This circle is full" },
      { status: 409 },
    );
  }

  // Does the joiner's active plan differ from the circle's plan?
  const [active] = await db
    .select({ planId: userPlanProgress.planId })
    .from(userPlanProgress)
    .where(
      and(
        eq(userPlanProgress.userId, session.userId),
        eq(userPlanProgress.isActive, true),
      ),
    );
  const planDiffers = active !== undefined && active.planId !== circle.planId;
  if (planDiffers && !confirmPlanSwitch) {
    return NextResponse.json(
      { ok: false, reason: "plan_switch", planName: circle.planName },
      { status: 409 },
    );
  }

  // Align the reading (pauses any other active plan — Step 12A), then join.
  await alignActivePlan(session.userId, circle.planId);
  await db
    .insert(circleMembers)
    .values({ circleId: circle.id, userId: session.userId });

  // Flip forming → active the moment the circle reaches minimum size, and open
  // the conversation with the cold-start icebreaker (Step 22). The icebreaker
  // runs AFTER the response so the join never waits on a Gloo call — the
  // thread's 10-second poll delivers it — and its per-circle idempotency fence
  // means a re-activation (dev: remove and re-add a member) posts nothing more.
  if (circle.state === "forming" && count + 1 >= MIN_MEMBERS) {
    await db
      .update(circles)
      .set({ state: "active" })
      .where(eq(circles.id, circle.id));
    after(() => postIcebreaker(circle.id));
  }

  return NextResponse.json({ ok: true, circleId: circle.id });
}
