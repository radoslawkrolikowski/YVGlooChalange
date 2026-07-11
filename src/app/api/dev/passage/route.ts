import { NextResponse } from "next/server";
import { fetchPassage, YouVersionApiError } from "@/lib/youversion";

export const dynamic = "force-dynamic";

// Step 3 verification route: fetches a passage live from YouVersion through
// the app's own client. Returns only public Bible content — the app key
// never leaves the server. Defaults: John 3:16 in NIV (version ID 111).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("ref") ?? "JHN.3.16";
  const versionIdParam = searchParams.get("versionId") ?? "111";
  const versionId = Number(versionIdParam);

  if (!Number.isFinite(versionId)) {
    return NextResponse.json(
      { ok: false, error: `versionId must be numeric, got "${versionIdParam}"` },
      { status: 400 },
    );
  }

  try {
    const passage = await fetchPassage(reference, versionId);
    return NextResponse.json({ ok: true, passage });
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
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
