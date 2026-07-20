import { NextResponse } from "next/server";
import { listCreatablePlans } from "@/lib/circles";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 16: the plans a signed-in user can start a circle on — the pre-defined
// library plus their own started plans (including personal AI-generated ones).
// Path A only, like the rest of circle creation.
export async function GET(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }
  if (session.kind !== "user") {
    return NextResponse.json(
      { ok: false, error: "Circles require a YouVersion account" },
      { status: 403 },
    );
  }

  const plans = await listCreatablePlans(session.userId);
  return NextResponse.json({ ok: true, plans });
}
