// Version copyright attribution — Step 7A.
//
// Whenever Bible text is displayed, the copyright attribution of the version
// it came from must be displayed with it (plan: global attribution
// constraint). This module resolves that attribution text for a set of
// version IDs, in order of preference:
//   1. the cached live catalogue (bible_versions table) — but only rows that
//      actually carry copyright text: the versions LIST endpoint the cache is
//      built from omits copyright for some versions (e.g. BSB) that the
//      single-version endpoint does report, so a null cached copyright means
//      "unknown", never "none",
//   2. a live fetchVersion call (the single-version endpoint, which has the
//      authoritative copyright field) — the result is written back into the
//      cache row when one exists, so each version costs at most one live
//      call per catalogue refresh cycle,
//   3. the version title (API's, else curated SUPPORTED_VERSIONS) as a last
//      resort, so an attribution line is always available.

import { eq, inArray } from "drizzle-orm";
import { findSupportedVersion } from "@/config/bible-versions";
import { db } from "@/db";
import { bibleVersions } from "@/db/schema";
import { fetchVersion } from "@/lib/youversion";

/**
 * Attribution line per version ID. IDs that cannot be resolved at all are
 * absent from the map — the caller renders nothing rather than a wrong line.
 */
export async function resolveVersionAttributions(
  versionIds: number[],
): Promise<Map<number, string>> {
  const attributions = new Map<number, string>();
  const distinct = [...new Set(versionIds)];
  if (distinct.length === 0) return attributions;

  // Cached titles for IDs whose cache row has no copyright text — kept as a
  // fallback in case the live lookup below fails too.
  const cachedTitles = new Map<number, string>();
  try {
    const rows = await db
      .select({
        id: bibleVersions.id,
        title: bibleVersions.title,
        copyright: bibleVersions.copyright,
      })
      .from(bibleVersions)
      .where(inArray(bibleVersions.id, distinct));
    for (const row of rows) {
      if (row.copyright) attributions.set(row.id, row.copyright);
      else cachedTitles.set(row.id, row.title);
    }
  } catch {
    // Cache unavailable — the live and curated fallbacks below still run.
  }

  await Promise.all(
    distinct
      .filter((id) => !attributions.has(id))
      .map(async (id) => {
        try {
          const version = await fetchVersion(id);
          attributions.set(id, version.copyright ?? version.title);
          if (version.copyright && cachedTitles.has(id)) {
            // Fill the cache row's missing copyright so the next render is a
            // cache hit (until the daily catalogue refresh nulls it again).
            try {
              await db
                .update(bibleVersions)
                .set({ copyright: version.copyright })
                .where(eq(bibleVersions.id, id));
            } catch {
              // Cache write is best-effort; the attribution is already set.
            }
          }
        } catch {
          const fallback =
            cachedTitles.get(id) ?? findSupportedVersion(id)?.title;
          if (fallback) attributions.set(id, fallback);
        }
      }),
  );

  return attributions;
}
