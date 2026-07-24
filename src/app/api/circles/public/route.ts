import { NextResponse } from "next/server";
import { loadPublicCircle } from "@/lib/circles";

export const dynamic = "force-dynamic";

// Step 30: the public demo circle's identity, for the Instant Access entry.
// No authentication — the circle is public by design; this only exposes its id,
// name, and state so an anonymous visitor can open it in one tap. Returns
// { ok: true, circle: null } when the demo has not been seeded yet, so the UI
// can show a graceful "not available" state instead of an error.
export async function GET() {
  const circle = await loadPublicCircle();
  return NextResponse.json({ ok: true, circle });
}
