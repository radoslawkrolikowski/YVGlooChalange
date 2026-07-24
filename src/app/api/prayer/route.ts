import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedPrayers } from "@/db/schema";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 26 — saved prayers for the Prayer tab.
//
// Path A persists here; Path B (Instant Access) keeps saved prayers in
// sessionStorage for the browser session and never writes a row (brief §7), so
// GET returns an empty list and POST is a no-op for anonymous sessions — the
// client owns Path B persistence.

const MAX_BODY_LENGTH = 4000;
const MAX_TITLE_LENGTH = 200;

export interface SavedPrayerEntry {
  id: string;
  mode: string;
  title: string | null;
  body: string;
  readingReference: string | null;
  language: string | null;
  createdAt: string;
}

export async function GET(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "No valid session" }, { status: 401 });
  }
  if (session.kind !== "user") {
    return NextResponse.json({ ok: true, prayers: [] });
  }

  const rows = await db
    .select()
    .from(savedPrayers)
    .where(eq(savedPrayers.userId, session.userId))
    .orderBy(desc(savedPrayers.createdAt));

  const prayers: SavedPrayerEntry[] = rows.map((row) => ({
    id: row.id,
    mode: row.mode,
    title: row.title,
    body: row.body,
    readingReference: row.readingReference,
    language: row.language,
    createdAt: row.createdAt.toISOString(),
  }));
  return NextResponse.json({ ok: true, prayers });
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
    return NextResponse.json({ ok: false, error: "A prayer is required" }, { status: 400 });
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ ok: false, error: "That prayer is too long" }, { status: 400 });
  }

  const mode = body.mode === "custom" ? "custom" : "daily";
  const title =
    typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE_LENGTH) || null : null;
  const readingReference =
    typeof body.readingReference === "string" ? body.readingReference.trim() || null : null;
  const language = typeof body.language === "string" ? body.language.trim() || null : null;

  // Anonymous sessions never get a database row — the client keeps them in
  // sessionStorage. Acknowledge so the client can persist locally.
  if (session.kind !== "user") {
    return NextResponse.json({ ok: true, persisted: false });
  }

  const [row] = await db
    .insert(savedPrayers)
    .values({ userId: session.userId, mode, title, body: text, readingReference, language })
    .returning();

  const prayer: SavedPrayerEntry = {
    id: row.id,
    mode: row.mode,
    title: row.title,
    body: row.body,
    readingReference: row.readingReference,
    language: row.language,
    createdAt: row.createdAt.toISOString(),
  };
  return NextResponse.json({ ok: true, persisted: true, prayer });
}
