import { NextResponse } from "next/server";
import { findSupportedVersion } from "@/config/bible-versions";
import {
  createSessionHighlight,
  listSessionHighlights,
  MAX_SESSION_HIGHLIGHT_LENGTH,
} from "@/lib/highlights";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 14: in-app highlights made while reading — Path A persistence.
//
// GET  /api/highlights/session?reference=PSA.23 → this user's in-app
//   highlights for that passage (all versions; the client filters to the
//   version on display).
// POST { reference, label, versionId, versionAbbreviation, text } → store
//   one highlight with the version it was made in.
//
// Anonymous sessions never hit this route: their highlights live in browser
// sessionStorage only (no database row, per the brief), so both handlers
// answer 401 with a hint the client already knows to expect.

const REFERENCE_PATTERN = /^[A-Z0-9]{3}(\.[0-9]+(-[0-9]+)?){0,2}$/;

export async function GET(request: Request) {
  const session = await resolveSession(request);
  if (!session || session.kind !== "user") {
    return NextResponse.json(
      { ok: false, error: "Sign in with YouVersion first" },
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

  const highlights = await listSessionHighlights(session.userId, reference);
  return NextResponse.json({ ok: true, highlights });
}

export async function POST(request: Request) {
  const session = await resolveSession(request);
  if (!session || session.kind !== "user") {
    return NextResponse.json(
      { ok: false, error: "Sign in with YouVersion first" },
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

  const highlight = await createSessionHighlight(session.userId, {
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
