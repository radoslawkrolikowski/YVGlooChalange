import { NextResponse } from "next/server";
import { chatCompletion, GlooApiError } from "@/lib/gloo";

export const dynamic = "force-dynamic";

// Step 4 verification route: sends a fixed prompt through the shared Gloo
// client and returns the live completion. The client writes the agent_logs
// row for the call; querying that table after hitting this route is the
// step's second verification.
export async function GET() {
  try {
    const completion = await chatCompletion({
      agentName: "dev",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant for a Scripture reading app called Round.",
        },
        {
          role: "user",
          content:
            "In one sentence, why do people read the Psalms in hard seasons?",
        },
      ],
      maxTokens: 200,
    });
    return NextResponse.json({ ok: true, completion });
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
