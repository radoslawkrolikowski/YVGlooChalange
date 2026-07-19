// Instant Access in-app highlights (Step 14) — Path B storage.
//
// Anonymous sessions have no database row, so highlights made while reading
// live in browser sessionStorage only: they survive navigation within the
// session and vanish when the browser closes, exactly like the anon session
// token itself ("no data persisted between sessions"). Path A never touches
// this module — signed-in highlights persist through /api/highlights/session.

export const ANON_HIGHLIGHTS_STORAGE_KEY = "round.anonHighlights";

/** Longest selection stored for one in-app highlight (both paths). */
export const MAX_SESSION_HIGHLIGHT_LENGTH = 300;

/** Path B mirror of a highlights row — same fields, no id. */
export interface AnonHighlight {
  /** USFM reference of the passage it was made in, e.g. "PSA.23". */
  reference: string;
  /** Human-readable passage reference, e.g. "Salmos 23". */
  label: string | null;
  /** Version ID the passage was DISPLAYED in when selected (per the brief). */
  versionId: number;
  versionAbbreviation: string | null;
  /** The selected text, exactly as rendered from YouVersion. */
  text: string;
  /** Copyright attribution of the version on display when selected —
   * captured at creation so the profile card can show it (the constraint:
   * Bible text is never displayed without its attribution). */
  attribution: string | null;
  createdAt: string;
}

export function loadAnonHighlights(): AnonHighlight[] {
  try {
    const raw = sessionStorage.getItem(ANON_HIGHLIGHTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AnonHighlight[]) : [];
  } catch {
    return [];
  }
}

export function saveAnonHighlight(highlight: AnonHighlight): AnonHighlight[] {
  const next = [...loadAnonHighlights(), highlight];
  try {
    sessionStorage.setItem(ANON_HIGHLIGHTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable — the in-memory list still renders.
  }
  return next;
}

export function clearAnonHighlights() {
  sessionStorage.removeItem(ANON_HIGHLIGHTS_STORAGE_KEY);
}
