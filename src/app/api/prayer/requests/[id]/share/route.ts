import { after, NextResponse } from "next/server";
import { loadPublicCircle, loadUserCircle } from "@/lib/circles";
import { shareRequest } from "@/lib/prayer-requests";
import { resolveSession } from "@/lib/session";
import { sessionOwner } from "@/lib/session-owner";
import { translateNewMessage } from "@/lib/translation";

export const dynamic = "force-dynamic";

// Step 35A — share one of your own prayer requests with your circle.
//
// Sharing is always explicit and per request: the client shows a confirmation
// ("Your circle will see this request") before calling this, and nothing is
// ever shared automatically. The card posts as a MEMBER-AUTHORED message
// (kind "prayer_request"), so Step 27's Translation Agent covers it exactly
// like any member message — async, cached, with "Show original".
//
// A request the Escalation Agent flagged can never be shared: shareRequest()
// refuses it server-side, not only in the UI that hides the button.
//
// Path B shares into the public demo circle — the one circle an anonymous
// session takes part in (Step 30).

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: requestId } = await params;
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "No valid session" }, { status: 401 });
  }

  const circle =
    session.kind === "user"
      ? await loadUserCircle(session.userId)
      : await loadPublicCircle();
  if (!circle) {
    return NextResponse.json(
      { ok: false, error: "You are not in a circle to share with" },
      { status: 400 },
    );
  }

  const result = await shareRequest(requestId, sessionOwner(session), circle);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json(
        { ok: false, error: "That request could not be found" },
        { status: 404 },
      );
    }
    if (result.reason === "flagged") {
      return NextResponse.json(
        { ok: false, error: "This request stays private." },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "That request is already shared" },
      { status: 409 },
    );
  }

  // Member-authored, so it translates like any message (Step 27): async, after
  // the response, so the Gloo fan-out never blocks the share.
  const sharedMessageId = result.messageId;
  after(() => translateNewMessage(sharedMessageId));

  return NextResponse.json({
    ok: true,
    request: result.request,
    circleId: circle.id,
  });
}
