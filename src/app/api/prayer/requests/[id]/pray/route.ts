import { NextResponse } from "next/server";
import { prayForRequest } from "@/lib/prayer-requests";
import { resolveSession } from "@/lib/session";
import { sessionOwner } from "@/lib/session-owner";

export const dynamic = "force-dynamic";

// Step 35A — "I prayed": one tap, once per member per request.
//
// The response carries a COUNT and nothing else. There is no endpoint, field,
// or query anywhere in the app that returns who prayed for a request — so
// neither "who prayed" nor its inverse "who hasn't" is derivable from the
// product, which is the no-comparison constraint applied to prayer.
//
// Repeating the tap is a no-op (the partial unique indexes on prayer_acts are
// the fence), and the count comes back unchanged rather than as an error.
//
// Path B: an anonymous session may pray for others' shared requests; the act
// is keyed to the session id and pruned on the Step 31 rail.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: requestId } = await params;
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "No valid session" }, { status: 401 });
  }

  const result = await prayForRequest(requestId, sessionOwner(session));
  if (!result.ok) {
    if (result.reason === "own_request") {
      return NextResponse.json(
        { ok: false, error: "This is your own request" },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "That request could not be found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    prayedCount: result.prayedCount,
    alreadyPrayed: result.alreadyPrayed,
  });
}
