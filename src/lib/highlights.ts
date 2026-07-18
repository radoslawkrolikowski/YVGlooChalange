// Highlight import — Step 7.
//
// Server-side logic behind the opt-in import: called only after the user
// explicitly allowed import on the consent screen. Highlights come from the
// YouVersion User Highlights API using the user's own OAuth access token
// (stored by the NextAuth adapter at sign-in); snippets and human-readable
// labels come from the Passages API — YouVersion remains the only source of
// Bible text, and Gloo is never involved anywhere in this module.
//
// The Highlights API only answers single-chapter queries (there is no "all
// my highlights" endpoint), so import is two-part:
//   1. Consent-time seed: scan the curated HIGHLIGHT_SCAN_CHAPTERS list.
//   2. Sync-on-read: every chapter the user opens in the app is synced via
//      syncChapterHighlights (wired into the passage view in Step 13).

import { and, desc, eq } from "drizzle-orm";
import {
  DEFAULT_VERSION_BY_LANGUAGE,
  findSupportedVersion,
  LICENSED_FALLBACK_BY_LANGUAGE,
} from "@/config/bible-versions";
import { HIGHLIGHT_SCAN_CHAPTERS } from "@/config/highlight-scan";
import { db } from "@/db";
import { accounts, highlights, users } from "@/db/schema";
import { resolveVersionAttributions } from "@/lib/version-attribution";
import {
  fetchChapterHighlights,
  fetchPassageSnippet,
  fetchVersion,
  type UserHighlight,
  YouVersionApiError,
} from "@/lib/youversion";

/** Highlights imported per run — keeps import one request-sized unit. */
const MAX_IMPORT = 100;
/** Stored snippet length cap. */
const MAX_SNIPPET_LENGTH = 200;
/** Parallel YouVersion calls during the chapter scan and snippet fetches. */
const SCAN_CONCURRENCY = 8;

export type HighlightsConsent = "granted" | "declined" | "revoked";

export interface HighlightSummary {
  count: number;
  /** Most recently imported entries for the profile's sample rows. */
  sample: {
    id: number;
    label: string;
    /** Version the snippet TEXT came from (may be the licensed fallback,
     * not the version the highlight was made in) — attribution and grouping
     * key off this, because attribution must match the displayed text. */
    snippetVersionId: number | null;
    versionAbbreviation: string | null;
    /** Copyright attribution of the version the snippet text came from —
     * displayed with the snippet per the global attribution constraint. */
    attribution: string | null;
    snippet: string | null;
    importedAt: string;
  }[];
}

export class HighlightImportError extends Error {
  constructor(
    message: string,
    /** True when a fresh sign-in would fix it (missing/expired/unscoped token). */
    public readonly needsReauth: boolean,
  ) {
    super(message);
    this.name = "HighlightImportError";
  }
}

async function youVersionAccessToken(userId: string): Promise<string> {
  const [account] = await db
    .select({ accessToken: accounts.access_token })
    .from(accounts)
    .where(
      and(eq(accounts.userId, userId), eq(accounts.provider, "youversion")),
    )
    .limit(1);
  if (!account?.accessToken) {
    throw new HighlightImportError(
      "No YouVersion access token on file",
      true,
    );
  }
  return account.accessToken;
}

export async function recordHighlightsConsent(
  userId: string,
  consent: HighlightsConsent,
): Promise<void> {
  await db
    .update(users)
    .set({ highlightsConsent: consent, highlightsConsentAt: new Date() })
    .where(eq(users.id, userId));
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

function isAuthFailure(error: unknown): boolean {
  return (
    error instanceof YouVersionApiError &&
    (error.status === 401 || error.status === 403)
  );
}

/**
 * Snippet + label for one highlighted verse. Preferentially fetched from the
 * version the highlight was made in; when that version isn't licensed for
 * passage fetches on this app key (403), the text falls back to the licensed
 * fallback version of the same language — still YouVersion, never any other
 * source. A total failure costs only the snippet, never the highlight.
 */
async function resolveSnippet(
  reference: string,
  versionId: number,
): Promise<{
  label: string | null;
  snippet: string | null;
  /** Version the snippet text was actually fetched from. */
  snippetVersionId: number | null;
}> {
  for (const id of [versionId, snippetFallbackVersionId(versionId)]) {
    try {
      const passage = await fetchPassageSnippet(reference, id);
      return {
        label: passage.label,
        snippet:
          passage.text.length > MAX_SNIPPET_LENGTH
            ? `${passage.text.slice(0, MAX_SNIPPET_LENGTH).trimEnd()}…`
            : passage.text,
        snippetVersionId: id,
      };
    } catch {
      // Try the fallback version, then give up on the snippet only.
    }
  }
  return { label: null, snippet: null, snippetVersionId: null };
}

/** The licensed same-language version a snippet fetch falls back to. */
function snippetFallbackVersionId(versionId: number): number {
  const language = findSupportedVersion(versionId)?.language ?? "en";
  return (
    LICENSED_FALLBACK_BY_LANGUAGE[language] ?? LICENSED_FALLBACK_BY_LANGUAGE.en
  );
}

/**
 * Best guess at a pre-7A row's snippet source: resolveSnippet tries the
 * highlight's own version first, which succeeds only when licensed;
 * otherwise the snippet came from the licensed fallback.
 */
function likelySnippetVersionId(versionId: number): number {
  return findSupportedVersion(versionId)?.licensed
    ? versionId
    : snippetFallbackVersionId(versionId);
}

/** Stores fetched highlights (snippets resolved), skipping duplicates. */
async function storeHighlights(
  userId: string,
  found: UserHighlight[],
): Promise<number> {
  if (found.length === 0) return 0;
  const toImport = found.slice(0, MAX_IMPORT);

  // Resolve each distinct version's abbreviation once; a failure only costs
  // the abbreviation, never the highlight.
  const versionIds = [...new Set(toImport.map((h) => h.versionId))];
  const abbreviations = new Map<number, string | null>();
  await Promise.all(
    versionIds.map(async (versionId) => {
      const supported = findSupportedVersion(versionId);
      if (supported) {
        abbreviations.set(versionId, supported.abbreviation);
        return;
      }
      try {
        const version = await fetchVersion(versionId);
        abbreviations.set(versionId, version.abbreviation);
      } catch {
        abbreviations.set(versionId, null);
      }
    }),
  );

  const rows = await mapConcurrent(
    toImport,
    SCAN_CONCURRENCY,
    async (highlight) => {
      const { label, snippet, snippetVersionId } = await resolveSnippet(
        highlight.reference,
        highlight.versionId,
      );
      return {
        userId,
        reference: highlight.reference,
        label,
        versionId: highlight.versionId,
        versionAbbreviation: abbreviations.get(highlight.versionId) ?? null,
        snippet,
        snippetVersionId,
        color: highlight.color,
      };
    },
  );

  const inserted = await db
    .insert(highlights)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: highlights.id });
  return inserted.length;
}

/** Versions worth scanning for a user: their chosen version plus the
 * language default (highlights live in the version they were made in). */
async function scanVersionIds(userId: string): Promise<number[]> {
  const [user] = await db
    .select({
      language: users.language,
      bibleVersionId: users.bibleVersionId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const language = user?.language ?? "en";
  const ids = new Set<number>();
  if (user?.bibleVersionId) ids.add(user.bibleVersionId);
  ids.add(
    DEFAULT_VERSION_BY_LANGUAGE[language] ?? DEFAULT_VERSION_BY_LANGUAGE.en,
  );
  return [...ids];
}

/**
 * Consent-time import: scans the curated chapter list in the user's likely
 * versions and stores every highlight found. Idempotent: the unique (user,
 * version, reference) index makes re-runs insert nothing new. Returns the
 * number of rows actually inserted.
 */
export async function importUserHighlights(userId: string): Promise<number> {
  const accessToken = await youVersionAccessToken(userId);
  const versionIds = await scanVersionIds(userId);

  const targets = versionIds.flatMap((versionId) =>
    HIGHLIGHT_SCAN_CHAPTERS.map((chapter) => ({ versionId, chapter })),
  );

  let authFailure: unknown = null;
  const perChapter = await mapConcurrent(
    targets,
    SCAN_CONCURRENCY,
    async ({ versionId, chapter }) => {
      if (authFailure) return [];
      try {
        return await fetchChapterHighlights(accessToken, versionId, chapter);
      } catch (error) {
        // An auth failure will fail every call — stop scanning and report;
        // any other per-chapter failure only skips that chapter.
        if (isAuthFailure(error)) authFailure = error;
        return [];
      }
    },
  );
  if (authFailure) {
    throw new HighlightImportError(
      "YouVersion did not authorise highlight access for this session",
      true,
    );
  }

  return storeHighlights(userId, perChapter.flat());
}

/**
 * Sync-on-read: imports any highlights in one chapter the user is reading.
 * No-op unless consent is "granted". Safe to call on every passage view
 * (Step 13 wires this in); failures are swallowed — reading never breaks
 * because a highlight sync hiccuped.
 */
export async function syncChapterHighlights(
  userId: string,
  versionId: number,
  chapterUsfm: string,
): Promise<void> {
  try {
    const [user] = await db
      .select({ consent: users.highlightsConsent })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (user?.consent !== "granted") return;

    const accessToken = await youVersionAccessToken(userId);
    const found = await fetchChapterHighlights(
      accessToken,
      versionId,
      chapterUsfm,
    );
    await storeHighlights(userId, found);
  } catch {
    // Never let a background sync surface into the reading experience.
  }
}

/** Count plus the most recent sample entries for the profile screen. */
export async function loadHighlightSummary(
  userId: string,
  sampleSize = 3,
): Promise<HighlightSummary> {
  const rows = await db
    .select({
      id: highlights.id,
      reference: highlights.reference,
      label: highlights.label,
      versionId: highlights.versionId,
      versionAbbreviation: highlights.versionAbbreviation,
      snippet: highlights.snippet,
      snippetVersionId: highlights.snippetVersionId,
      importedAt: highlights.importedAt,
    })
    .from(highlights)
    .where(eq(highlights.userId, userId))
    .orderBy(desc(highlights.importedAt), desc(highlights.id));

  // Attribution follows the snippet's actual source version; pre-7A rows
  // without one stored get the deterministic best guess.
  const sampleRows = rows.slice(0, sampleSize).map((row) => ({
    ...row,
    snippetVersionId:
      row.snippet === null
        ? null
        : (row.snippetVersionId ?? likelySnippetVersionId(row.versionId)),
  }));
  const attributions = await resolveVersionAttributions(
    sampleRows
      .map((row) => row.snippetVersionId)
      .filter((id): id is number => id !== null),
  );

  return {
    count: rows.length,
    sample: sampleRows.map((row) => ({
      id: row.id,
      label: row.label ?? row.reference,
      snippetVersionId: row.snippetVersionId,
      versionAbbreviation: row.versionAbbreviation,
      attribution:
        row.snippetVersionId !== null
          ? (attributions.get(row.snippetVersionId) ?? null)
          : null,
      snippet: row.snippet,
      importedAt: row.importedAt.toISOString(),
    })),
  };
}

/** Revoke: delete every imported highlight and record the revocation. */
export async function revokeHighlights(userId: string): Promise<void> {
  await db.delete(highlights).where(eq(highlights.userId, userId));
  await recordHighlightsConsent(userId, "revoked");
}
