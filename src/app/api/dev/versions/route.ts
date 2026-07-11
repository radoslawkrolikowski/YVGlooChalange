import { NextResponse } from "next/server";
import { listBibleVersions, YouVersionApiError } from "@/lib/youversion";

export const dynamic = "force-dynamic";

// Step 3 verification route: lists Bible versions for a language live from
// the YouVersion Bible Versions API. Accepts ISO 639-1 or 639-3 codes,
// e.g. /api/dev/versions?language=es
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const language = searchParams.get("language") ?? "en";

  try {
    const versions = await listBibleVersions(language);
    return NextResponse.json({ ok: true, language, count: versions.length, versions });
  } catch (error) {
    if (error instanceof YouVersionApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          endpoint: error.endpoint,
          upstreamStatus: error.status,
          upstreamBody: error.body,
        },
        { status: error.status === 400 ? 400 : 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
