// Version copyright attribution — Step 7A.
//
// Whenever Bible text is displayed, the copyright attribution of the version
// it came from must be displayed with it (plan: global attribution
// constraint). This module resolves that attribution text for a set of
// version IDs, in order of preference:
//   1. the cached live catalogue (bible_versions table — has the API's
//      copyright text),
//   2. a live fetchVersion call for IDs the per-language cache doesn't hold
//      (highlights can be made in any version, not just the app's curated
//      languages) — not written back into the cache, whose rows are pruned
//      per-language on refresh,
//   3. the curated SUPPORTED_VERSIONS title as a last resort.
// Versions without copyright text from the API (e.g. public domain) fall
// back to the version title, so an attribution line is always available.

import { inArray } from "drizzle-orm";
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
      attributions.set(row.id, row.copyright ?? row.title);
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
        } catch {
          const supported = findSupportedVersion(id);
          if (supported) attributions.set(id, supported.title);
        }
      }),
  );

  return attributions;
}
