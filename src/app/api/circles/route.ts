import { NextResponse } from "next/server";
import { db } from "@/db";
import { circleMembers, circles } from "@/db/schema";
import {
  alignActivePlan,
  canAttachPlan,
  listOpenCircles,
  loadUserCircle,
  userHasCircle,
} from "@/lib/circles";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 16: circle browse and creation (Path A only).
//
// GET returns the signed-in user's own circle (or null) plus the list of open
// circles they could join. POST creates a circle on a chosen plan with the
// creator as its founding member — the chosen plan becomes the creator's
// active plan (Step 12A pause), since every member shares the circle's plan.
//
// Anonymous Instant Access sessions have no users row to be a member of, so
// circles are unavailable to them here (they join the demo circle in Step 30);
// the routes answer 403 rather than pretending.

export async function GET(request: Request) {
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

  const [circle, open] = await Promise.all([
    loadUserCircle(session.userId),
    listOpenCircles(session.userId),
  ]);
  return NextResponse.json({ ok: true, circle, open });
}

export async function POST(request: Request) {
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const planId = body.planId;
  if (name.length === 0) {
    return NextResponse.json(
      { ok: false, error: "A circle name is required" },
      { status: 400 },
    );
  }
  if (typeof planId !== "string" || planId.length === 0) {
    return NextResponse.json(
      { ok: false, error: "A plan is required" },
      { status: 400 },
    );
  }

  // One circle per user in Step 16.
  if (await userHasCircle(session.userId)) {
    return NextResponse.json(
      { ok: false, reason: "already_member", error: "You are already in a circle" },
      { status: 409 },
    );
  }

  // The plan must be one the creator may attach: a library plan or one they
  // have started (which covers their own AI-generated plans).
  if (!(await canAttachPlan(session.userId, planId))) {
    return NextResponse.json(
      { ok: false, error: "That plan isn't available for a circle" },
      { status: 404 },
    );
  }

  // Create the circle (forming, one member) and align the creator's reading.
  const [circle] = await db
    .insert(circles)
    .values({ name, planId, createdBy: session.userId, state: "forming" })
    .returning({ id: circles.id });
  await db
    .insert(circleMembers)
    .values({ circleId: circle.id, userId: session.userId });
  await alignActivePlan(session.userId, planId);

  return NextResponse.json({ ok: true, circleId: circle.id });
}
