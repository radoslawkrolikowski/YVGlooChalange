import { NextResponse } from "next/server";
import { markRequestAnswered } from "@/lib/prayer-requests";
import { resolveSession } from "@/lib/session";
import { sessionOwner } from "@/lib/session-owner";

export const dynamic = "force-dynamic";

// Step 35A — mark a prayer request answered. AUTHOR ONLY.
//
// Answering is testimony about your own request, so the ownership check in
// markRequestAnswered() is the feature, not a formality: another member's call
// finds no request of theirs and gets a 404, and no accumulation of prayer acts
// can ever move a request's status on its own.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: requestId } = await params;
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "No valid session" }, { status: 401 });
  }

  const result = await markRequestAnswered(requestId, sessionOwner(session));
  if (!result.ok) {
    if (result.reason === "already_answered") {
      return NextResponse.json(
        { ok: false, error: "That request is already marked answered" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "That request could not be found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, request: result.request });
}
