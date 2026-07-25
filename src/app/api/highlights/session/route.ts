import { NextResponse } from "next/server";
import { findSupportedVersion } from "@/config/bible-versions";
import { MAX_SESSION_HIGHLIGHT_LENGTH } from "@/config/highlights";
import {
  createSessionHighlight,
  listSessionHighlights,
  loadSessionHighlightList,
} from "@/lib/highlights";
import { resolveSession } from "@/lib/session";
import { sessionOwner } from "@/lib/session-owner";

export const dynamic = "force-dynamic";

// Step 14: in-app highlights made while reading. Step 30A opens the route to
// anonymous Instant Access sessions, whose rows are tagged with the session id
// instead of a user id — session-scoped and pruned on the Step 31 rail, so the
// reading screen behaves identically on both paths with no "sign in to use
// this" gate. (The Step 7 OAuth *import* remains Path A only: it needs a
// YouVersion account by definition.)
//
// GET  /api/highlights/session?reference=PSA.23 → the caller's in-app
//   highlights for that passage (all versions; the client filters to the
//   version on display).
// GET  /api/highlights/session → every in-app highlight the caller has made,
//   newest first, with copyright attributions resolved — the profile's
//   "Highlighted in Round" card, which Path B renders client-side.
// POST { reference, label, versionId, versionAbbreviation, text } → store
//   one highlight with the version it was made in.

const REFERENCE_PATTERN = /^[A-Z0-9]{3}(\.[0-9]+(-[0-9]+)?){0,2}$/;

export async function GET(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }
  const owner = sessionOwner(session);

  const reference = new URL(request.url).searchParams.get("reference");
  if (reference === null) {
    const highlights = await loadSessionHighlightList(owner);
    return NextResponse.json({ ok: true, highlights });
  }
  if (!REFERENCE_PATTERN.test(reference)) {
    return NextResponse.json(
      { ok: false, error: "A USFM reference is required, e.g. PSA.23" },
      { status: 400 },
    );
  }

  const highlights = await listSessionHighlights(owner, reference);
  return NextResponse.json({ ok: true, highlights });
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

  const { reference, label, versionId, versionAbbreviation, text } = body;
  if (typeof reference !== "string" || !REFERENCE_PATTERN.test(reference)) {
    return NextResponse.json(
      { ok: false, error: "A USFM reference is required, e.g. PSA.23" },
      { status: 400 },
    );
  }
  if (
    typeof text !== "string" ||
    text.trim().length === 0 ||
    text.length > MAX_SESSION_HIGHLIGHT_LENGTH
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `text must be 1–${MAX_SESSION_HIGHLIGHT_LENGTH} characters`,
      },
      { status: 400 },
    );
  }
  // The version must be one the passage view can actually have displayed.
  const version =
    typeof versionId === "number" ? findSupportedVersion(versionId) : null;
  if (!version) {
    return NextResponse.json(
      { ok: false, error: "versionId must be a supported Bible version" },
      { status: 400 },
    );
  }

  const highlight = await createSessionHighlight(sessionOwner(session), {
    reference,
    label: typeof label === "string" && label.length > 0 ? label : null,
    versionId: version.id,
    versionAbbreviation:
      typeof versionAbbreviation === "string" && versionAbbreviation.length > 0
        ? versionAbbreviation
        : version.abbreviation,
    text,
  });
  return NextResponse.json({ ok: true, highlight });
}
