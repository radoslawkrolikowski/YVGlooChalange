import { NextResponse } from "next/server";
import { groundedCompletion, GlooApiError } from "@/lib/gloo";

export const dynamic = "force-dynamic";

// Step 32 verification route: issues a grounded completion against the Psalms
// commentary corpus for a passage reference and returns the completion together
// with its citations, so retrieval can be judged on its own before the Context
// Agent (Step 33) consumes it.
//
//   /api/dev/grounded?reference=Psalm%2023   → sourcesReturned: true, citations
//                                              whose titles name Psalm 23
//   /api/dev/grounded?reference=Mark%204     → sourcesReturned: false
//
// citationTitles is surfaced separately because it is the field that matters:
// item titles are the only signal for which passage the grounding came from.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference") ?? "Psalm 23";
  const sourcesLimitParam = searchParams.get("sourcesLimit");
  const sourcesLimit = sourcesLimitParam ? Number(sourcesLimitParam) : undefined;

  try {
    const grounded = await groundedCompletion({
      agentName: "dev",
      sourcesLimit,
      // tradition is deliberately not sent: Gloo refuses
      // "not_faith_specific" unless a specific model is named, and pinning a
      // model here would drop auto-routing for no benefit to this check.
      maxTokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You explain Bible commentary for a Scripture reading app called Round. " +
            "Use only the retrieved commentary. If none of it concerns the passage " +
            "asked about, say so plainly instead of answering from general knowledge.",
        },
        {
          role: "user",
          content:
            `What does the commentary say about ${reference}? ` +
            "Summarise the historical context and any notable imagery in two or three sentences.",
        },
      ],
    });

    return NextResponse.json({
      ok: true,
      reference,
      sourcesReturned: grounded.sourcesReturned,
      citationTitles: grounded.citations.map((citation) => citation.itemTitle),
      citations: grounded.citations,
      completion: { content: grounded.content, model: grounded.model },
    });
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
