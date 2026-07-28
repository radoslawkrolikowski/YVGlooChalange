import { NextResponse } from "next/server";
import { screenReflection } from "@/lib/escalation";
import {
  answerPassageQuestion,
  MAX_QUESTION_LENGTH,
} from "@/lib/passage-qa";
import {
  claimQuestionSlot,
  questionQuotaKey,
  refundQuestionSlot,
  releaseQuestionSlot,
  remainingQuestions,
} from "@/lib/question-quota";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 33A — "Ask about this passage": grounded Q&A over the commentary corpus.
//
// POST /api/passage/ask  { label: "Psalm 23", question: "..." }
//
// Order of operations is the point of this route, and it is not negotiable:
//
//   1. session — both paths, one resolver, no persistence either way;
//   2. quota   — the cap is charged BEFORE any Gloo call, so a capped session
//                costs nothing at all (the Escalation classification is itself
//                a paid round trip);
//   3. Escalation — a free-text box on a Bible passage is a likely place for
//                crisis language, so it passes the same gate as a reflection.
//                A flagged question returns the support-card resources and
//                issues NO search and NO completion;
//   4. retrieval + answer — only then, and only over chunks from the passage's
//                own corpus file.
//
// The response always distinguishes the four outcomes explicitly, because the
// reading screen renders each of them differently and "no commentary covers
// this passage" is a fact worth stating rather than an empty answer.
//
// Nothing is written to any table. The agent_logs rows the Gloo client writes
// are the entire audit trail, identical for signed-in and anonymous readers.

/** Rejects a label the corpus mapping could never parse anyway, and keeps an
 * arbitrary client string out of the prompt. */
const LABEL_PATTERN = /^[\p{L}\p{N} .,:;'’\-–—]{1,80}$/u;

export async function POST(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid session" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const question =
    typeof body.question === "string"
      ? body.question.trim().replace(/\s+/g, " ")
      : "";

  if (!LABEL_PATTERN.test(label)) {
    return NextResponse.json(
      { ok: false, error: "A passage label is required, e.g. Psalm 23" },
      { status: 400 },
    );
  }
  if (question.length === 0) {
    return NextResponse.json(
      { ok: false, error: "A question is required" },
      { status: 400 },
    );
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { ok: false, error: "That question is a little long — try shortening it." },
      { status: 400 },
    );
  }

  const quotaKey = questionQuotaKey(session);
  const claim = claimQuestionSlot(quotaKey);
  if (!claim.ok) {
    // Both bounds answer 200: neither is an error, and the UI says so gently.
    return NextResponse.json({ ok: true, status: claim.reason, remaining: 0 });
  }

  try {
    // Escalation first — the same gate every reflection passes. Only the
    // reference is audited; the question text is never persisted anywhere.
    let flaggedResources;
    try {
      const screen = await screenReflection({
        reflectionId: `passage-question-${crypto.randomUUID()}`,
        text: question,
      });
      if (screen.verdict.flagged) flaggedResources = screen.resources;
    } catch {
      // The gate is unresolved, so nothing downstream may run — fail safe, and
      // give the reader their allowance back.
      refundQuestionSlot(quotaKey);
      return NextResponse.json(
        {
          ok: false,
          error: "Your question could not be checked. Please try again.",
        },
        { status: 502 },
      );
    }

    if (flaggedResources) {
      return NextResponse.json({
        ok: true,
        status: "flagged",
        resources: flaggedResources,
        remaining: claim.remaining,
      });
    }

    try {
      const result = await answerPassageQuestion({
        passageLabel: label,
        question,
        language: session.language ?? "en",
      });
      return NextResponse.json({
        ok: true,
        ...result,
        remaining: claim.remaining,
      });
    } catch {
      // The Gloo client has already written the error row to agent_logs.
      refundQuestionSlot(quotaKey);
      return NextResponse.json(
        {
          ok: false,
          error: "The commentary could not be reached. Please try again.",
          remaining: remainingQuestions(quotaKey),
        },
        { status: 502 },
      );
    }
  } finally {
    releaseQuestionSlot(quotaKey);
  }
}
