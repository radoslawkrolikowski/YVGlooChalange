import { NextResponse } from "next/server";
import { loadNote, MAX_NOTE_LENGTH, saveNote } from "@/lib/notes";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 19A: private per-passage notes — Path A persistence.
//
// GET  /api/notes?reference=PSA.23 → this user's note for that passage, or
//   { note: null } when none exists.
// PUT  { reference, label?, body } → upsert the note (debounced autosave from
//   the reading screen). An empty body deletes it; the response reports the
//   saved note or null.
//
// Anonymous sessions never hit this route: their notes live in browser
// sessionStorage only (no database row, per the brief), so both handlers
// answer 401 with a hint the client already knows to expect. Notes are
// private — never shared, never fed to any agent — so nothing here exposes
// them anywhere else.

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

  const note = await loadNote(session.userId, reference);
  return NextResponse.json({ ok: true, note });
}

export async function PUT(request: Request) {
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

  const { reference, label, body: noteBody } = body;
  if (typeof reference !== "string" || !REFERENCE_PATTERN.test(reference)) {
    return NextResponse.json(
      { ok: false, error: "A USFM reference is required, e.g. PSA.23" },
      { status: 400 },
    );
  }
  if (typeof noteBody !== "string" || noteBody.length > MAX_NOTE_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `body must be 0–${MAX_NOTE_LENGTH} characters` },
      { status: 400 },
    );
  }

  const note = await saveNote(session.userId, {
    reference,
    label: typeof label === "string" && label.length > 0 ? label : null,
    body: noteBody,
  });
  return NextResponse.json({ ok: true, note });
}
