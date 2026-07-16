import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  findSupportedVersion,
  SUPPORTED_LANGUAGES,
} from "@/config/bible-versions";
import { db } from "@/db";
import { users } from "@/db/schema";
import { remintAnonSession } from "@/lib/anon-session";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 9: persists the reading preferences chosen in onboarding/settings.
// Path A: written to the users row. Path B: the anonymous session has no
// database row, so a replacement signed token is minted and returned — the
// client swaps it into sessionStorage.
//
// Server-side validation enforces the catalogue decision no matter what the
// client sends: the language must have curated entries and the version must
// be a LICENSED member of SUPPORTED_VERSIONS for that language — an
// unlicensed or unknown version can never be stored, so a stored selection
// can never 403 on passage fetch.
export async function POST(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }

  let body: { language?: unknown; bibleVersionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { language, bibleVersionId } = body;
  if (typeof language !== "string" || !SUPPORTED_LANGUAGES.includes(language)) {
    return NextResponse.json(
      { ok: false, error: `Unsupported language` },
      { status: 400 },
    );
  }
  const version =
    typeof bibleVersionId === "number"
      ? findSupportedVersion(bibleVersionId)
      : undefined;
  if (!version || version.language !== language) {
    return NextResponse.json(
      { ok: false, error: "Version is not offered for this language" },
      { status: 400 },
    );
  }
  if (!version.licensed) {
    return NextResponse.json(
      { ok: false, error: `${version.abbreviation} is not available yet` },
      { status: 400 },
    );
  }

  if (session.kind === "user") {
    await db
      .update(users)
      .set({ language, bibleVersionId: version.id })
      .where(eq(users.id, session.userId));
    return NextResponse.json({
      ok: true,
      session: { ...session, language, bibleVersionId: version.id },
    });
  }

  const reminted = remintAnonSession(session, {
    language,
    bibleVersionId: version.id,
  });
  return NextResponse.json({
    ok: true,
    token: reminted.token,
    session: reminted.session,
  });
}
