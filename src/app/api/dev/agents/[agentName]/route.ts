import { NextResponse } from "next/server";
import { getAgent } from "@/agents";
import { GlooApiError } from "@/lib/gloo";
import { devToolingEnabled } from "@/lib/dev-gate";

export const dynamic = "force-dynamic";

// Step 5: triggers one agent by name with a JSON input body (the agent's
// sampleInput when the body is empty). Backs the Agent Console page and is
// the curl-able equivalent; Step 23's cron routes are separate and secured.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentName: string }> },
) {
  if (!devToolingEnabled()) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { agentName } = await params;
  const agent = getAgent(agentName);
  if (!agent) {
    return NextResponse.json(
      { ok: false, error: `Unknown agent "${agentName}"` },
      { status: 404 },
    );
  }

  let input: unknown = agent.sampleInput;
  const rawBody = await request.text();
  if (rawBody.trim()) {
    try {
      input = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }
  }

  try {
    const result = await agent.run(input);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof GlooApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          upstreamStatus: error.status,
          upstreamBody: error.body,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
