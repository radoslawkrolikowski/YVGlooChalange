import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 8: returns the request's resolved session (authenticated or
// anonymous). The /home page uses it to validate the stored token; it also
// proves the unified resolver works for any future route to copy.
export async function GET(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }
  return NextResponse.json({ ok: true, session });
}
