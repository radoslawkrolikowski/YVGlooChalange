// Step 23: dev-only proxy the Agent Console uses to trigger the cron routes
// locally. Vercel Cron does not run in dev, and the browser must never hold
// CRON_SECRET — so this route (gated like every dev tool) invokes the EXACT
// production route handler in-process, constructing the same
// `Authorization: Bearer ${CRON_SECRET}` request Vercel Cron sends. Local
// testing therefore exercises the identical code path, auth check included.

import { NextResponse } from "next/server";
import { devToolingEnabled } from "@/lib/dev-gate";
import { GET as dailyGET } from "@/app/api/cron/daily/route";
import { GET as facilitatorGET } from "@/app/api/cron/facilitator/route";
import { GET as reminderGET } from "@/app/api/cron/reminder/route";
import { GET as healthGET } from "@/app/api/cron/health/route";
import { GET as demoRefreshGET } from "@/app/api/cron/demo-refresh/route";

export const dynamic = "force-dynamic";

const handlers: Record<string, (request: Request) => Promise<Response>> = {
  daily: dailyGET,
  facilitator: facilitatorGET,
  reminder: reminderGET,
  health: healthGET,
  "demo-refresh": demoRefreshGET,
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  if (!devToolingEnabled()) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { job } = await params;
  const handler = handlers[job];
  if (!handler) {
    return NextResponse.json(
      { ok: false, error: `Unknown cron job "${job}"` },
      { status: 404 },
    );
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not set — see .env.example" },
      { status: 500 },
    );
  }

  return handler(
    new Request(`http://cron.local/api/cron/${job}`, {
      headers: { authorization: `Bearer ${secret}` },
    }),
  );
}
