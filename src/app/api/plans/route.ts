import { NextResponse } from "next/server";
import { listPlans } from "@/lib/plans";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 11: the pre-defined plan library, for the selection screens. Both
// session paths read the same list.
export async function GET(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }
  return NextResponse.json({ ok: true, plans: await listPlans() });
}
