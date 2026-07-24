import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { seedPublicDemoCircle } from "@/lib/demo-seed";
import { devToolingEnabled } from "@/lib/dev-gate";

export const dynamic = "force-dynamic";
// Seeding runs several live Gloo calls; give it room beyond the default.
export const maxDuration = 120;

// Step 30: provision the public demo circle. Idempotent — safe to call more
// than once. Authorized either by the CRON_SECRET bearer (so it can be run
// exactly once in production with a single authenticated curl, no manual DB
// work) or in any non-production environment (so the dev Agent Console can call
// it locally without the secret). Never open to the public.
export async function POST(request: Request) {
  if (!cronAuthorized(request) && !devToolingEnabled()) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await seedPublicDemoCircle();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Seed failed",
      },
      { status: 500 },
    );
  }
}
