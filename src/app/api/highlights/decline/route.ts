import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordHighlightsConsent } from "@/lib/highlights";

export const dynamic = "force-dynamic";

// Step 7: the consent screen's "Skip" action. Declining stores the answer
// (so the screen never re-asks) and nothing else — no highlights are read,
// and every feature keeps working.
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in with YouVersion first" },
      { status: 401 },
    );
  }

  await recordHighlightsConsent(session.user.id, "declined");
  return NextResponse.json({ ok: true });
}
