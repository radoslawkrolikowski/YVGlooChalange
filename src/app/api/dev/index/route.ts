import { NextResponse } from "next/server";
import { fetchBibleIndex, YouVersionApiError } from "@/lib/youversion";

export const dynamic = "force-dynamic";

// Step 3 verification route: fetches a version's book/chapter index live
// from YouVersion — the structure behind the book and chapter pickers.
// e.g. /api/dev/index?versionId=3034
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const versionIdParam = searchParams.get("versionId") ?? "3034";
  const versionId = Number(versionIdParam);

  if (!Number.isFinite(versionId)) {
    return NextResponse.json(
      { ok: false, error: `versionId must be numeric, got "${versionIdParam}"` },
      { status: 400 },
    );
  }

  try {
    const index = await fetchBibleIndex(versionId);
    return NextResponse.json({
      ok: true,
      versionId: index.versionId,
      textDirection: index.textDirection,
      bookCount: index.books.length,
      index,
    });
  } catch (error) {
    if (error instanceof YouVersionApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          endpoint: error.endpoint,
          upstreamStatus: error.status,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
