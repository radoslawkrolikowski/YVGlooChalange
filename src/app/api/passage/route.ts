import { NextResponse } from "next/server";
import {
  effectiveVersionId,
  findSupportedVersion,
} from "@/config/bible-versions";
import { resolveSession } from "@/lib/session";
import { resolveVersionAttributions } from "@/lib/version-attribution";
import { fetchPassage, YouVersionApiError } from "@/lib/youversion";

export const dynamic = "force-dynamic";

// Step 13: the reading screen's passage fetch.
//
// GET /api/passage?reference=PSA.23[&versionId=147]
//
// The version actually fetched is resolved server-side: an explicit
// versionId (the one-tap switcher) must be a licensed SUPPORTED_VERSIONS
// entry; otherwise the session's effective version applies (Decisions §
// version catalogue — chosen version while licensed, else language default,
// else licensed fallback). If the passage is unavailable in that version,
// the language's default (licensed fallback) is fetched instead and the
// response says so — the stored preference is never overwritten here.
//
// The response always carries the copyright attribution and deep link of the
// version whose text is returned, so the UI can never show text with a
// mismatched attribution.

/** bible.com passage deep link — opens the Bible App when installed. */
function passageDeepLink(versionId: number, reference: string): string {
  return `https://www.bible.com/bible/${versionId}/${encodeURIComponent(reference)}`;
}

function abbreviationFor(versionId: number): string {
  return findSupportedVersion(versionId)?.abbreviation ?? `#${versionId}`;
}

/** Statuses that mean "this version cannot serve this passage" — the
 * fallback trigger. Anything else (auth, network, 5xx) is a real error. */
function isUnavailable(error: unknown): boolean {
  return (
    error instanceof YouVersionApiError &&
    [400, 403, 404].includes(error.status)
  );
}

export async function GET(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference");
  if (!reference || !/^[A-Z0-9]{3}(\.[0-9]+(-[0-9]+)?){0,2}$/.test(reference)) {
    return NextResponse.json(
      { ok: false, error: "A USFM reference is required, e.g. PSA.23" },
      { status: 400 },
    );
  }

  const language = session.language ?? "en";

  let requestedVersionId: number;
  const versionParam = searchParams.get("versionId");
  if (versionParam !== null) {
    const requested = findSupportedVersion(Number(versionParam));
    if (!requested || !requested.licensed) {
      return NextResponse.json(
        { ok: false, error: "Version is not available" },
        { status: 400 },
      );
    }
    requestedVersionId = requested.id;
  } else {
    requestedVersionId = effectiveVersionId(language, session.bibleVersionId);
  }

  let passage;
  let fallbackFrom: number | null = null;
  try {
    passage = await fetchPassage(reference, requestedVersionId);
  } catch (error) {
    // Passage unavailable in the requested version: fetch the language
    // default instead and tell the UI — never touching the saved preference.
    const fallbackId = effectiveVersionId(language, null);
    if (!isUnavailable(error) || fallbackId === requestedVersionId) {
      return NextResponse.json(
        { ok: false, error: "The passage could not be loaded" },
        { status: 502 },
      );
    }
    try {
      passage = await fetchPassage(reference, fallbackId);
      fallbackFrom = requestedVersionId;
    } catch {
      return NextResponse.json(
        { ok: false, error: "The passage could not be loaded" },
        { status: 502 },
      );
    }
  }

  const attribution =
    (await resolveVersionAttributions([passage.versionId])).get(
      passage.versionId,
    ) ?? null;

  return NextResponse.json({
    ok: true,
    passage: {
      reference: passage.reference,
      content: passage.content,
      versionId: passage.versionId,
      versionAbbreviation: passage.versionAbbreviation,
    },
    attribution,
    deepLink: passageDeepLink(passage.versionId, reference),
    // Set only when the fallback ran: which version the user asked for.
    fallback: fallbackFrom
      ? {
          requestedVersionId: fallbackFrom,
          requestedAbbreviation: abbreviationFor(fallbackFrom),
        }
      : null,
  });
}
