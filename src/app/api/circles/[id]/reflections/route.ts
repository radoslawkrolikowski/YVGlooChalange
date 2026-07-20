import { NextResponse } from "next/server";
import { isCircleMember, loadCirclePlanDay, loadThreadMessages } from "@/lib/circles";
import { submitReflection } from "@/lib/reflections";
import { GlooApiError } from "@/lib/gloo";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 19: reflection submission through the Escalation gate (Path A only).
//
// POST appends one reflection for a plan day. The Escalation Agent runs first,
// synchronously, inside submitReflection() — before anything is stored or
// posted. Unflagged reflections post to the thread as a day-tagged reflection
// card and the fresh thread is returned; flagged ones are stored privately
// (never posted) and the response carries the crisis resources for the
// author's support card, with no trace in the returned thread. Circles are a
// signed-in feature: anonymous Instant Access sessions join the demo circle in
// Step 30, so only a member with a YouVersion account may reflect here.

const MAX_BODY_LENGTH = 4000;

/** Resolve the requester and confirm they may touch this circle's thread. */
async function requireMember(request: Request, circleId: string) {
  const session = await resolveSession(request);
  if (!session) {
    return {
      error: NextResponse.json(
        { ok: false, error: "No valid session" },
        { status: 401 },
      ),
    };
  }
  if (session.kind !== "user") {
    return {
      error: NextResponse.json(
        { ok: false, error: "Circles require a YouVersion account" },
        { status: 403 },
      ),
    };
  }
  if (!(await isCircleMember(session.userId, circleId))) {
    return {
      error: NextResponse.json(
        { ok: false, error: "You are not a member of this circle" },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: circleId } = await params;
  const guard = await requireMember(request, circleId);
  if (guard.error) return guard.error;
  const { session } = guard;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length === 0) {
    return NextResponse.json(
      { ok: false, error: "A reflection is required" },
      { status: 400 },
    );
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { ok: false, error: "That reflection is too long" },
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

  // Resolve the plan day from the circle's own plan — the client never dictates
  // the reference/label, so a reflection can only ever be tagged to a real day
  // of the circle's plan.
  const day = await loadCirclePlanDay(circleId, dayNumber as number);
  if (!day) {
    return NextResponse.json(
      { ok: false, error: "That plan day does not exist for this circle" },
      { status: 400 },
    );
  }

  try {
    const result = await submitReflection({
      circleId,
      authorId: session.userId,
      sourceLanguage: session.language ?? null,
      dayNumber: day.dayNumber,
      reference: day.reference,
      label: day.label,
      body: text,
    });

    if (result.flagged) {
      // Never posted — no thread returned. The author gets the support card;
      // other members' thread views show no trace of this reflection.
      return NextResponse.json({
        ok: true,
        flagged: true,
        resources: result.resources,
      });
    }

    // Unflagged: return the fresh thread so the poster sees their reflection
    // immediately, without waiting for the next poll interval.
    const messageList = await loadThreadMessages(circleId);
    return NextResponse.json({
      ok: true,
      flagged: false,
      messages: messageList,
    });
  } catch (error) {
    // Fail safe: the Escalation gate could not produce a verdict, so nothing
    // was stored or posted. Tell the author to try again rather than letting
    // an unscreened reflection through.
    if (error instanceof GlooApiError) {
      return NextResponse.json(
        { ok: false, error: "Your reflection could not be checked. Please try again." },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Your reflection could not be saved. Please try again." },
      { status: 500 },
    );
  }
}
