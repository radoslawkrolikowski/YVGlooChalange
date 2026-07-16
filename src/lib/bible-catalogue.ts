// Bible version catalogue cache — Step 9.
//
// The live YouVersion Bible Versions API response is snapshotted per language
// into the bible_versions table with a 24-hour TTL and lazy revalidation:
// fresh rows are served directly; stale rows are served immediately while a
// background refresh runs (via next/server `after`); an empty cache fetches
// synchronously. The catalogue only VALIDATES and ENRICHES the curated
// SUPPORTED_VERSIONS config — it never expands what the picker offers
// (Decisions: config is the source of truth; anything outside the app key's
// licenses 403s on passage fetch).

import { eq, lt, and } from "drizzle-orm";
import { after } from "next/server";
import {
  versionsForLanguage,
  type SupportedVersion,
} from "@/config/bible-versions";
import { db } from "@/db";
import { bibleVersions } from "@/db/schema";
import { listBibleVersions, type BibleVersion } from "@/lib/youversion";

const TTL_MS = 24 * 60 * 60 * 1000;

export interface CatalogueResult {
  versions: BibleVersion[];
  /**
   * "fresh"  — cache within TTL;
   * "stale"  — served past-TTL rows, background refresh scheduled;
   * "miss"   — nothing cached and the live fetch failed (empty versions).
   */
  status: "fresh" | "stale" | "miss";
}

/** A curated version enriched with what the live catalogue knows about it. */
export interface EnrichedVersion extends SupportedVersion {
  /**
   * true/false when the catalogue answered; null when the catalogue was
   * unavailable, in which case availability is unknown and the curated
   * config stands on its own.
   */
  inCatalogue: boolean | null;
  /** Live API title when present — usually more current than the config's. */
  apiTitle: string | null;
  /** "Open in Bible App" deep link from the live catalogue. */
  deepLink: string | null;
}

async function refreshLanguage(language: string): Promise<BibleVersion[]> {
  const fetched = await listBibleVersions(language);
  const fetchedAt = new Date();

  for (const v of fetched) {
    await db
      .insert(bibleVersions)
      .values({
        id: v.id,
        language,
        abbreviation: v.abbreviation,
        title: v.title,
        copyright: v.copyright ?? null,
        deepLink: v.deepLink ?? null,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: bibleVersions.id,
        set: {
          language,
          abbreviation: v.abbreviation,
          title: v.title,
          copyright: v.copyright ?? null,
          deepLink: v.deepLink ?? null,
          fetchedAt,
        },
      });
  }
  // Versions that disappeared from the live catalogue drop out of the cache.
  await db
    .delete(bibleVersions)
    .where(
      and(
        eq(bibleVersions.language, language),
        lt(bibleVersions.fetchedAt, fetchedAt),
      ),
    );
  return fetched;
}

function toBibleVersion(
  row: typeof bibleVersions.$inferSelect,
): BibleVersion {
  return {
    id: row.id,
    abbreviation: row.abbreviation,
    title: row.title,
    language: row.language,
    copyright: row.copyright ?? undefined,
    deepLink: row.deepLink ?? undefined,
  };
}

/**
 * The cached live catalogue for a language (ISO 639-1, e.g. "es"), refreshed
 * per the TTL policy above. Never throws: a failed live fetch degrades to
 * stale rows or a "miss".
 */
export async function getCatalogue(language: string): Promise<CatalogueResult> {
  let rows: (typeof bibleVersions.$inferSelect)[] = [];
  try {
    rows = await db
      .select()
      .from(bibleVersions)
      .where(eq(bibleVersions.language, language));
  } catch {
    rows = [];
  }

  const oldest = rows.reduce(
    (min, row) => Math.min(min, row.fetchedAt.getTime()),
    Infinity,
  );

  if (rows.length > 0 && Date.now() - oldest < TTL_MS) {
    return { versions: rows.map(toBibleVersion), status: "fresh" };
  }

  if (rows.length > 0) {
    // Serve stale immediately; revalidate after the response is sent.
    after(async () => {
      try {
        await refreshLanguage(language);
      } catch {
        // Next request past the TTL retries — stale data keeps serving.
      }
    });
    return { versions: rows.map(toBibleVersion), status: "stale" };
  }

  try {
    return { versions: await refreshLanguage(language), status: "fresh" };
  } catch {
    return { versions: [], status: "miss" };
  }
}

/**
 * The curated SUPPORTED_VERSIONS for a language, enriched against the live
 * catalogue. This is what the picker renders — never the raw catalogue.
 */
export async function getSupportedVersionsForLanguage(
  language: string,
): Promise<{ versions: EnrichedVersion[]; catalogueStatus: CatalogueResult["status"] }> {
  const supported = versionsForLanguage(language);
  const catalogue = await getCatalogue(language);
  const byId = new Map(catalogue.versions.map((v) => [v.id, v]));

  const versions = supported.map((v) => {
    const live = byId.get(v.id);
    return {
      ...v,
      inCatalogue: catalogue.status === "miss" ? null : live !== undefined,
      apiTitle: live?.title ?? null,
      deepLink: live?.deepLink ?? null,
    };
  });
  return { versions, catalogueStatus: catalogue.status };
}
