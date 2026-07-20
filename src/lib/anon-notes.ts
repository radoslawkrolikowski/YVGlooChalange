// Instant Access private notes (Step 19A) — Path B storage.
//
// Anonymous sessions have no database row, so a reader's private per-passage
// notes live in browser sessionStorage only: they survive navigation within
// the session and vanish when the browser closes, exactly like in-app
// highlights ("no data persisted between sessions", brief §7). Path A never
// touches this module — signed-in notes persist through /api/notes.
//
// Like the notes table, a note is keyed by the passage REFERENCE (not the
// version): switching versions shows the same note. One note per reference —
// saving replaces the existing entry; emptying it removes the entry entirely,
// so an emptied note never lingers in the "My notes" list.

export const ANON_NOTES_STORAGE_KEY = "round.anonNotes";

/** Longest note body stored (both paths) — a scratch surface, not an essay. */
export const MAX_NOTE_LENGTH = 4000;

/** Path B mirror of a notes row — keyed by reference, no id. */
export interface AnonNote {
  /** USFM reference of the passage the note hangs on, e.g. "PSA.23". */
  reference: string;
  /** Human-readable passage label, e.g. "Salmos 23" — for the My notes list. */
  label: string | null;
  /** The reader's free text. */
  body: string;
  /** Last-edited time — drives the reverse-chronological My notes order. */
  updatedAt: string;
}

export function loadAnonNotes(): AnonNote[] {
  try {
    const raw = sessionStorage.getItem(ANON_NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AnonNote[]) : [];
  } catch {
    return [];
  }
}

/** This session's note for one passage reference, or null. */
export function loadAnonNote(reference: string): AnonNote | null {
  return loadAnonNotes().find((note) => note.reference === reference) ?? null;
}

/**
 * Upserts one passage's note. An empty (whitespace-only) body deletes the
 * note instead of storing a blank one. Returns the full list after the write.
 */
export function saveAnonNote(input: {
  reference: string;
  label: string | null;
  body: string;
}): AnonNote[] {
  const body = input.body.slice(0, MAX_NOTE_LENGTH);
  const others = loadAnonNotes().filter(
    (note) => note.reference !== input.reference,
  );
  const next =
    body.trim().length === 0
      ? others
      : [
          ...others,
          {
            reference: input.reference,
            label: input.label,
            body,
            updatedAt: new Date().toISOString(),
          },
        ];
  try {
    sessionStorage.setItem(ANON_NOTES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable — the in-memory value the caller keeps
    // still renders; the note just won't survive this navigation.
  }
  return next;
}

export function clearAnonNotes() {
  sessionStorage.removeItem(ANON_NOTES_STORAGE_KEY);
}
