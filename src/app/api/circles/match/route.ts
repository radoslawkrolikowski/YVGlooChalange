import { NextResponse } from "next/server";
import { userHasCircle } from "@/lib/circles";
import { matchUserToCircle } from "@/lib/matching";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 21: "match me" — the third path into a circle (Path A only).
//
// POST runs the Matching agent over the user's onboarding profile and every
// open circle and returns a proposal for the user to confirm, or — when there
// is no open circle at all — creates a `forming` circle with them as founding
// member and returns that instead (Decisions: never queue, never a dead end).
//
// It is a POST because the zero-circles path writes. It is safe to re-run: a
// user who already belongs to a circle gets `reason: "already_member"` back
// with their circle id rather than a second match or a second founded circle,
// so a reload of the match screen can never create two circles.
//
// The join is NOT performed here — the user confirms first, and the confirm
// goes through /api/circles/[id]/join like every other join, so the plan-switch
// prompt and size rules are enforced in one place.

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

  if (await userHasCircle(session.userId)) {
    return NextResponse.json(
      {
        ok: false,
        reason: "already_member",
        error: "You are already in a circle",
      },
      { status: 409 },
    );
  }

  const result = await matchUserToCircle(
    session.userId,
    session.language ?? "en",
  );
  if (!result) {
    return NextResponse.json(
      { ok: false, error: "No reading plan is available to start a circle on" },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, result });
}
