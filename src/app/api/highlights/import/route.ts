import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  HighlightImportError,
  importUserHighlights,
  loadHighlightSummary,
  recordHighlightsConsent,
} from "@/lib/highlights";

export const dynamic = "force-dynamic";

// Step 7: the consent screen's "Allow" action. Path A only — Instant Access
// has no YouVersion identity and never sees the consent screen. Consent is
// recorded first, then the import runs; an import failure leaves consent
// granted so nothing re-asks, and the response says what went wrong.
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in with YouVersion first" },
      { status: 401 },
    );
  }

  await recordHighlightsConsent(session.user.id, "granted");

  try {
    const imported = await importUserHighlights(session.user.id);
    const summary = await loadHighlightSummary(session.user.id);
    return NextResponse.json({ ok: true, imported, count: summary.count });
  } catch (error) {
    if (error instanceof HighlightImportError && error.needsReauth) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "YouVersion hasn't authorised highlight access for this session. Sign out and sign back in, then allow import again.",
        },
        { status: 403 },
      );
    }
    console.error("Highlight import failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Importing highlights failed. Please try again in a moment.",
      },
      { status: 502 },
    );
  }
}
