import { NextResponse } from "next/server";
import { GlooApiError } from "@/lib/gloo";
import { createPrayerRequest, listOwnRequests } from "@/lib/prayer-requests";
import { resolveSession } from "@/lib/session";
import { sessionOwner } from "@/lib/session-owner";

export const dynamic = "force-dynamic";

// Step 35A — the author's own prayer requests.
//
// GET lists them (newest first), flagged ones included: a flagged request stays
// the author's own and they keep their words; it is only the circle that never
// sees it.
//
// POST creates one. It is PRIVATE the moment it is stored — sharing is a
// separate, explicit action (./[id]/share). The Escalation Agent runs first,
// synchronously, inside createPrayerRequest(), before any row exists; a flagged
// request is stored private, can never be shared, and the response carries the
// crisis resources for the author's support card while only the request's ID
// reaches the audit log.
//
// Both session paths: a member's requests are owned by their user row, an
// Instant Access visitor's by their anonymous session id — no users row, gone
// with the session (pruned on the Step 31 rail).

const MAX_BODY_LENGTH = 2000;

export async function GET(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "No valid session" }, { status: 401 });
  }
  const requests = await listOwnRequests(sessionOwner(session));
  return NextResponse.json({ ok: true, requests });
}

export async function POST(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "No valid session" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length === 0) {
    return NextResponse.json(
      { ok: false, error: "A prayer request is required" },
      { status: 400 },
    );
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { ok: false, error: "That request is too long" },
      { status: 400 },
    );
  }

  try {
    const result = await createPrayerRequest({
      owner: sessionOwner(session),
      anonName: session.kind === "user" ? null : session.displayName,
      sourceLanguage: session.language ?? null,
      body: text,
    });
    return NextResponse.json({
      ok: true,
      flagged: result.flagged,
      resources: result.resources,
      request: result.request,
    });
  } catch (error) {
    // Fail safe: the Escalation gate could not produce a verdict, so nothing
    // was stored. An unscreened request is never accepted.
    if (error instanceof GlooApiError) {
      return NextResponse.json(
        { ok: false, error: "Your request could not be checked. Please try again." },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Your request could not be saved. Please try again." },
      { status: 500 },
    );
  }
}
