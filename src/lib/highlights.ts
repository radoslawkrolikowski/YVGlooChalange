// Highlight import — Step 7.
//
// Server-side logic behind the opt-in import: called only after the user
// explicitly allowed import on the consent screen. Highlights come from the
// YouVersion User Highlights API using the user's own OAuth access token
// (stored by the NextAuth adapter at sign-in); snippets and human-readable
// labels come from the Passages API — YouVersion remains the only source of
// Bible text, and Gloo is never involved anywhere in this module.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, highlights, users } from "@/db/schema";
import {
  fetchPassageSnippet,
  fetchUserHighlights,
  fetchVersion,
  YouVersionApiError,
} from "@/lib/youversion";

/** Highlights imported per run — keeps import one request-sized unit. */
const MAX_IMPORT = 100;
/** Stored snippet length cap. */
const MAX_SNIPPET_LENGTH = 200;
/** Parallel Passages fetches while resolving snippets. */
const SNIPPET_CONCURRENCY = 5;

export type HighlightsConsent = "granted" | "declined" | "revoked";

export interface HighlightSummary {
  count: number;
  /** Most recently imported entries for the profile's sample rows. */
  sample: {
    id: number;
    label: string;
    versionAbbreviation: string | null;
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
  items: T[],
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

/**
 * Imports the user's existing YouVersion highlights. Idempotent: the unique
 * (user, version, reference) index makes re-runs insert nothing new. Returns
 * the number of rows actually inserted.
 */
export async function importUserHighlights(userId: string): Promise<number> {
  const accessToken = await youVersionAccessToken(userId);

  let fetched;
  try {
    fetched = await fetchUserHighlights(accessToken);
  } catch (error) {
    if (
      error instanceof YouVersionApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      throw new HighlightImportError(
        "YouVersion did not authorise highlight access for this session",
        true,
      );
    }
    throw error;
  }

  const toImport = fetched.slice(0, MAX_IMPORT);
  if (toImport.length === 0) return 0;

  // Resolve each distinct version's abbreviation once; a failure only costs
  // the abbreviation, never the highlight.
  const versionIds = [...new Set(toImport.map((h) => h.versionId))];
  const abbreviations = new Map<number, string | null>();
  await Promise.all(
    versionIds.map(async (versionId) => {
      try {
        const version = await fetchVersion(versionId);
        abbreviations.set(versionId, version.abbreviation);
      } catch {
        abbreviations.set(versionId, null);
      }
    }),
  );

  // Snippets via the Passages API — the Highlights API carries no text. A
  // failed snippet fetch still imports the highlight (reference + version
  // remain useful to the PreReading/PostReading agents).
  const rows = await mapConcurrent(
    toImport,
    SNIPPET_CONCURRENCY,
    async (highlight) => {
      let label: string | null = null;
      let snippet: string | null = null;
      try {
        const passage = await fetchPassageSnippet(
          highlight.reference,
          highlight.versionId,
        );
        label = passage.label;
        snippet =
          passage.text.length > MAX_SNIPPET_LENGTH
            ? `${passage.text.slice(0, MAX_SNIPPET_LENGTH).trimEnd()}…`
            : passage.text;
      } catch {
        // Reference/version still stored below.
      }
      return {
        userId,
        reference: highlight.reference,
        label,
        versionId: highlight.versionId,
        versionAbbreviation: abbreviations.get(highlight.versionId) ?? null,
        snippet,
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
      versionAbbreviation: highlights.versionAbbreviation,
      snippet: highlights.snippet,
      importedAt: highlights.importedAt,
    })
    .from(highlights)
    .where(eq(highlights.userId, userId))
    .orderBy(desc(highlights.importedAt), desc(highlights.id));

  return {
    count: rows.length,
    sample: rows.slice(0, sampleSize).map((row) => ({
      id: row.id,
      label: row.label ?? row.reference,
      versionAbbreviation: row.versionAbbreviation,
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
