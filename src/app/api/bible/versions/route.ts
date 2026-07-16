import { NextResponse } from "next/server";
import {
  DEFAULT_VERSION_BY_LANGUAGE,
  effectiveVersionId,
  SUPPORTED_LANGUAGES,
} from "@/config/bible-versions";
import { getSupportedVersionsForLanguage } from "@/lib/bible-catalogue";

export const dynamic = "force-dynamic";

// Step 9: the version picker's data source. Returns the curated
// SUPPORTED_VERSIONS for a language enriched against the cached live
// catalogue (24h TTL, lazy revalidation) — never the raw catalogue, which
// would offer versions the app key cannot fetch (403). The picker renders
// instantly from the config it already ships with; this endpoint's job is
// validation and enrichment in the background.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const language = searchParams.get("language") ?? "en";

  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unsupported language "${language}" — supported: ${SUPPORTED_LANGUAGES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const { versions, catalogueStatus } =
    await getSupportedVersionsForLanguage(language);

  return NextResponse.json({
    ok: true,
    language,
    catalogueStatus,
    versions: versions.map((v) => ({
      id: v.id,
      abbreviation: v.abbreviation,
      title: v.apiTitle ?? v.title,
      licensed: v.licensed,
      // Selectable = licensed and not known-missing from the live catalogue.
      // An unknown catalogue (miss) never downgrades a curated version.
      selectable: v.licensed && v.inCatalogue !== false,
      deepLink: v.deepLink,
    })),
    defaultVersionId: DEFAULT_VERSION_BY_LANGUAGE[language] ?? null,
    effectiveDefaultVersionId: effectiveVersionId(language, null),
  });
}
