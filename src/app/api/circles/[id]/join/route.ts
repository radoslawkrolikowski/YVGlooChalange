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
import { remintAnonCircleJoin, type AnonSession } from "@/lib/anon-session";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 16: join an open circle. Step 30A extends it to anonymous sessions for
// the public demo circle — the only circle Path B may join.
//
// Joining aligns the joiner's reading to the circle's attached plan. If their
// active plan differs, the first call returns `reason: "plan_switch"` with the
// circle's plan name so the client can show the explicit prompt ("This circle
// reads … — switch your reading?"); the client re-POSTs with
// `confirmPlanSwitch: true` to proceed. Declining simply never calls again, so
// the join is cancelled with the plan untouched — never a silent swap, on
// either path.
//
// Path A membership is a `circle_members` row. Path B has no user row to key
// one to, so membership is recorded in the re-minted token and returned for the
// client to swap into sessionStorage — it ends with the session, like every
// other anonymous artifact. Rejoining a circle you are already in is a no-op
// that succeeds, so the join call is safe to make on every arrival.
//
// The circle flips forming → active the moment it reaches MIN_MEMBERS; a join
// at MAX_MEMBERS is refused with a friendly `reason: "full"`. The public circle
// is unbounded and never counts anonymous sessions towards membership at all.

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

  const { id: circleId } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // A confirm-less join sends no body — that is fine.
  }
  const confirmPlanSwitch = body.confirmPlanSwitch === true;

  if (session.kind !== "user") {
    return joinAnonymously(session, circleId, confirmPlanSwitch);
  }

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

/**
 * Path B join: no membership row and no user row — the signed token records
 * the circle and takes on its plan, so /plan, /read and Home all see the
 * circle's reading the way a member's do. The same plan-switch confirmation
 * gate as Path A, with one honest difference in the client's copy: an
 * anonymous session carries a single plan, so a switch replaces the old one
 * rather than pausing it (Step 12A — no plan history without persistence).
 */
async function joinAnonymously(
  session: AnonSession,
  circleId: string,
  confirmPlanSwitch: boolean,
): Promise<NextResponse> {
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
  if (circle.kind !== CIRCLE_KIND_PUBLIC) {
    return NextResponse.json(
      {
        ok: false,
        reason: "needs_account",
        error: "Joining this circle needs a YouVersion account",
      },
      { status: 403 },
    );
  }
  if (circle.state !== "forming" && circle.state !== "active") {
    return NextResponse.json(
      { ok: false, reason: "closed", error: "This circle is no longer open" },
      { status: 409 },
    );
  }

  // A plan they chose themselves is never replaced without a confirmation.
  // Already being in this circle is not a switch: their plan is its plan.
  const alreadyMember = session.circleId === circle.id;
  const planDiffers =
    !alreadyMember &&
    session.plan !== null &&
    session.plan.planId !== circle.planId;
  if (planDiffers && !confirmPlanSwitch) {
    return NextResponse.json(
      { ok: false, reason: "plan_switch", planName: circle.planName },
      { status: 409 },
    );
  }

  const reminted = remintAnonCircleJoin(session, {
    circleId: circle.id,
    planId: circle.planId,
  });
  return NextResponse.json({
    ok: true,
    circleId: circle.id,
    token: reminted.token,
    session: reminted.session,
  });
}
