import { NextResponse } from "next/server";
import { chatCompletion, searchCorpus, GlooApiError } from "@/lib/gloo";
import { chunksForPassage, corpusFileForPassage } from "@/lib/corpus";

export const dynamic = "force-dynamic";

/** Chunks handed to the completion — enough for a short answer, not the whole item. */
const CHUNK_BUDGET = 12;

// Step 32 verification route for the Search + Completions V2 retrieval path
// (the one the Context Agent will use in Step 33 — see the plan's retrieval
// architecture decision). Compare with /api/dev/grounded, which exercises the
// one-call Grounded Completions endpoint.
//
//   /api/dev/search?reference=Psalm%2023          → retrieval only
//   /api/dev/search?reference=Psalm%2023&question=why+the+shepherd+image
//   /api/dev/search?reference=Mark%204            → covered: false, no chunks
//
// The response reports what was retrieved BEFORE and AFTER the filename filter,
// because that gap is the whole point of this path: everything dropped was a
// chunk from some other Psalm that semantic retrieval thought was relevant.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference") ?? "Psalm 23";
  const question = searchParams.get("question");

  const corpusFile = corpusFileForPassage(reference);
  if (!corpusFile) {
    return NextResponse.json({
      ok: true,
      reference,
      corpusFile: null,
      covered: false,
      detail: "no corpus file can cover this passage (the corpus is Psalms only)",
    });
  }

  try {
    const hits = await searchCorpus({
      agentName: "dev",
      query: question
        ? `${reference} commentary. ${question}`
        : `${reference} commentary`,
    });
    // Unbudgeted first, so the response can separate the two reasons a chunk
    // did not make it into the prompt: wrong item, or simply beyond the budget.
    const onTarget = chunksForPassage(hits, reference);
    const scoped = chunksForPassage(hits, reference, CHUNK_BUDGET);

    const commentary = scoped.map((chunk) => chunk.snippet).join("\n\n");
    const answer =
      scoped.length > 0
        ? await chatCompletion({
            agentName: "dev",
            maxTokens: 400,
            messages: [
              {
                role: "system",
                content:
                  "You explain Bible commentary for a Scripture reading app called Round. " +
                  "Answer only from the commentary excerpts supplied by the user message. " +
                  "If they do not address the question, say so plainly rather than " +
                  "answering from general knowledge.",
              },
              {
                role: "user",
                content:
                  `Commentary excerpts for ${reference}:\n\n${commentary}\n\n` +
                  (question
                    ? `Question from a reader: "${question}"`
                    : "Restate the historical context and imagery in plain modern English, in three sentences."),
              },
            ],
          })
        : null;

    return NextResponse.json({
      ok: true,
      reference,
      corpusFile,
      covered: scoped.length > 0,
      retrieved: hits.length,
      /** Chunks from this passage's own file — the recall the query achieved. */
      onTarget: onTarget.length,
      /** Dropped because they belong to some other Psalm. */
      droppedFromOtherItems: hits.length - onTarget.length,
      /** On-target chunks left out by CHUNK_BUDGET, not by the filter. */
      droppedByBudget: onTarget.length - scoped.length,
      kept: scoped.length,
      keptChars: commentary.length,
      // Proof of scoping: every title here must name the requested passage.
      keptTitles: [...new Set(scoped.map((chunk) => chunk.itemTitle))],
      keptParts: scoped.map((chunk) => chunk.part),
      certaintyRange:
        scoped.length > 0
          ? [
              Math.min(...scoped.map((chunk) => chunk.certainty ?? 0)),
              Math.max(...scoped.map((chunk) => chunk.certainty ?? 0)),
            ]
          : null,
      answer: answer && { content: answer.content, model: answer.model },
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
