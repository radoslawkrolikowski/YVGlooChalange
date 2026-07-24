// Shared client types for the Prayer tab (Step 26).

export type PrayerMode = "daily" | "custom";

/** A saved prayer as the tab renders it — mirrors the /api/prayer shape;
 * Path B builds the same shape locally in sessionStorage. */
export interface SavedPrayer {
  id: string;
  mode: string;
  title: string | null;
  body: string;
  readingReference: string | null;
  language: string | null;
  createdAt: string;
}

/** How the generation sheet was opened. */
export type PrayerIntent =
  | { kind: "daily" }
  | { kind: "custom"; prompt: string }
  | { kind: "view"; prayer: SavedPrayer };

/** A prayer to persist — the tab owns Path A (POST) vs Path B (sessionStorage). */
export interface PrayerDraft {
  mode: PrayerMode;
  body: string;
  title: string | null;
  readingReference: string | null;
  language: string | null;
}
