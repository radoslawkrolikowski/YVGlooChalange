import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { savedPrayers } from "@/db/schema";
import { resolveSession } from "@/lib/session";
import { ownerColumns, ownerWhere, sessionOwner } from "@/lib/session-owner";

export const dynamic = "force-dynamic";

// Step 26 — saved prayers for the Prayer tab.
//
// Both session paths since Step 30A: a signed-in user's prayer is owned by
// their user row, an Instant Access visitor's by their anonymous session id.
// The anonymous row creates no users row, is readable only by that session, and
// is pruned on the Step 31 rail — session-scoped, not persisted.

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
  const rows = await db
    .select()
    .from(savedPrayers)
    .where(
      ownerWhere(
        savedPrayers.userId,
        savedPrayers.anonSessionId,
        sessionOwner(session),
      ),
    )
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

  const [row] = await db
    .insert(savedPrayers)
    .values({
      ...ownerColumns(sessionOwner(session)),
      mode,
      title,
      body: text,
      readingReference,
      language,
    })
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
