import { NextResponse } from "next/server";
import { resolvePreReadingPrompts } from "@/lib/pre-reading";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 15: personalised pre-reading prompts for today's passage.
//
// GET /api/pre-reading?reference=PSA.23
//
// Both session paths resolve through the same handler. `prompts` is an array
// of 2–3 strings on success, or null when they can't be produced (passage
// unavailable, Gloo failure) — the reading screen shows a silent hidden state
// in that case, so the reading experience never blocks on this card.
//
// Path A caches the result per (user, passage) server-side, so a reload is a
// cache hit with no new agent_logs row; Path B generates live and the client
// caches in sessionStorage for the browser session.

const REFERENCE_PATTERN = /^[A-Z0-9]{3}(\.[0-9]+(-[0-9]+)?){0,2}$/;

export async function GET(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }

  const reference = new URL(request.url).searchParams.get("reference");
  if (!reference || !REFERENCE_PATTERN.test(reference)) {
    return NextResponse.json(
      { ok: false, error: "A USFM reference is required, e.g. PSA.23" },
      { status: 400 },
    );
  }

  try {
    const prompts = await resolvePreReadingPrompts(session, reference);
    return NextResponse.json({ ok: true, prompts });
  } catch {
    // The card is non-essential — a generation failure is a hidden state,
    // never an error the reading screen has to surface.
    return NextResponse.json({ ok: true, prompts: null });
  }
}
