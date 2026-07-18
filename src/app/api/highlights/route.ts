import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadHighlightSummary, revokeHighlights } from "@/lib/highlights";

export const dynamic = "force-dynamic";

// Step 7 profile wiring: GET returns the imported-highlight count and sample
// entries; DELETE is the revoke action — every imported row is deleted and
// the consent record flips to "revoked". Highlights in the YouVersion app
// itself are never touched.

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in with YouVersion first" },
      { status: 401 },
    );
  }
  const summary = await loadHighlightSummary(session.user.id);
  return NextResponse.json({ ok: true, ...summary });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in with YouVersion first" },
      { status: 401 },
    );
  }
  await revokeHighlights(session.user.id);
  return NextResponse.json({ ok: true });
}
