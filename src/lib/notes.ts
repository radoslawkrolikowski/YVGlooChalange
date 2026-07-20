// Private per-passage notes — Step 19A (Path A persistence).
//
// One free-text note per (user, passage reference), saved as the reader types
// (debounced autosave through /api/notes). A note hangs on the passage
// REFERENCE, not the version: switching the version on the reading screen
// shows the same note. Notes are private to their owner — never posted to a
// thread, never shared, never fed to any agent, never joined into any
// circle-facing view. Gloo and YouVersion are never involved: no Scripture
// text is stored, only the reference the note hangs on (app-managed, not the
// YouVersion Notes API — brief §85).
//
// Anonymous sessions never reach this module — their notes live in browser
// sessionStorage (src/lib/anon-notes.ts), never in the database.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { MAX_NOTE_LENGTH } from "@/lib/anon-notes";

export { MAX_NOTE_LENGTH };

/** One reader's note for a single passage. */
export interface Note {
  reference: string;
  label: string | null;
  body: string;
  updatedAt: string;
}

/** A "My notes" list row — enough to render the preview and deep-link. */
export interface NoteListEntry {
  reference: string;
  label: string | null;
  body: string;
  updatedAt: string;
}

/** This user's note for one passage reference, or null if none. */
export async function loadNote(
  userId: string,
  reference: string,
): Promise<Note | null> {
  const [row] = await db
    .select({
      reference: notes.reference,
      label: notes.label,
      body: notes.body,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.reference, reference)))
    .limit(1);
  if (!row) return null;
  return {
    reference: row.reference,
    label: row.label,
    body: row.body,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Upserts one passage's note (the autosave target). An empty body deletes the
 * note rather than storing a blank one, so an emptied note drops out of the
 * "My notes" list. Returns the saved note, or null when it was deleted.
 */
export async function saveNote(
  userId: string,
  input: { reference: string; label: string | null; body: string },
): Promise<Note | null> {
  const body = input.body.slice(0, MAX_NOTE_LENGTH);

  if (body.trim().length === 0) {
    await db
      .delete(notes)
      .where(
        and(eq(notes.userId, userId), eq(notes.reference, input.reference)),
      );
    return null;
  }

  const now = new Date();
  const [row] = await db
    .insert(notes)
    .values({
      userId,
      reference: input.reference,
      label: input.label,
      body,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [notes.userId, notes.reference],
      set: { body, label: input.label, updatedAt: now },
    })
    .returning({
      reference: notes.reference,
      label: notes.label,
      body: notes.body,
      updatedAt: notes.updatedAt,
    });
  return {
    reference: row.reference,
    label: row.label,
    body: row.body,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Every note the user has kept, most-recently-edited first — the profile's
 * "My notes" section. Owner's eyes only, like everything in this table.
 */
export async function loadNotesList(userId: string): Promise<NoteListEntry[]> {
  const rows = await db
    .select({
      reference: notes.reference,
      label: notes.label,
      body: notes.body,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt), desc(notes.id));
  return rows.map((row) => ({
    reference: row.reference,
    label: row.label,
    body: row.body,
    updatedAt: row.updatedAt.toISOString(),
  }));
}
