import { NextResponse } from "next/server";
import { generatePrayer, buildPrayerMessages, type PrayerInput } from "@/agents/prayer";
import { chatCompletionStream } from "@/lib/gloo";
import { screenReflection } from "@/lib/escalation";
import { buildUserPrayerContext } from "@/lib/prayer-context";
import { resolveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Step 26 — generate a private, personal prayer for the Prayer tab.
//
// Two modes: "daily" (prayer for the day, grounded in the user's own material +
// today's reading) and "custom" (led by a free-text request). The prayer is
// shown only to the requester and never posted to any circle here — sharing is
// a separate, explicit action (see /api/prayer/share).
//
// Custom prompts are user-authored AI input and a high-likelihood crisis
// surface, so the request text passes the Escalation gate FIRST — exactly like
// a reflection. A flagged prompt returns the support-card resources and NO
// prayer is generated. Daily mode has no free-text input to screen (it draws
// on already-screened reflections + benign profile/highlight data).
//
// By default the prayer streams token-by-token as SSE (the tab's "thinking
// effect"). A client whose stream was interrupted retries with stream:false
// for a single non-streamed attempt.

const MAX_PROMPT_LENGTH = 2000;

export async function POST(request: Request) {
  const session = await resolveSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "No valid session" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode === "custom" ? "custom" : "daily";
  const wantsStream = body.stream !== false;
  const language = session.language ?? "en";

  let userPrompt = "";
  if (mode === "custom") {
    userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (userPrompt.length === 0) {
      return NextResponse.json(
        { ok: false, error: "A prayer request is required" },
        { status: 400 },
      );
    }
    if (userPrompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { ok: false, error: "That request is too long" },
        { status: 400 },
      );
    }

    // Escalation first — same gate reflections pass. A flagged prompt is never
    // sent to the Prayer agent; the author gets the quiet support card instead.
    try {
      const screen = await screenReflection({
        reflectionId: `prayer-${crypto.randomUUID()}`,
        text: userPrompt,
      });
      if (screen.verdict.flagged) {
        return NextResponse.json({ ok: true, flagged: true, resources: screen.resources });
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: "Your request could not be checked. Please try again." },
        { status: 502 },
      );
    }
  }

  // Gather the user's own private material (Path A only; anon has no server
  // history, so the prayer is a general one in their language).
  const context =
    session.kind === "user"
      ? await buildUserPrayerContext(session.userId)
      : { text: "", readingReference: null, readingLabel: null };

  const input: PrayerInput = {
    mode,
    language,
    userPrompt: mode === "custom" ? userPrompt : undefined,
    readingReference: context.readingReference ?? undefined,
    privateContext: context.text || undefined,
  };

  if (!wantsStream) {
    try {
      const { text } = await generatePrayer(input);
      return NextResponse.json({
        ok: true,
        flagged: false,
        text,
        readingReference: context.readingReference,
        readingLabel: context.readingLabel,
      });
    } catch {
      return NextResponse.json(
        { ok: false, error: "The prayer could not be written. Please try again." },
        { status: 502 },
      );
    }
  }

  // Stream the prayer as SSE: one `data: {"delta": "..."}` frame per token,
  // a terminal `{"done": true, "text": "..."}`, or `{"error": true}`.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      let full = "";
      try {
        for await (const chunk of chatCompletionStream({
          agentName: "prayer",
          messages: buildPrayerMessages(input),
          maxTokens: 500,
        })) {
          full += chunk.delta;
          send({ delta: chunk.delta });
        }
        send({
          done: true,
          text: full.trim(),
          readingReference: context.readingReference,
          readingLabel: context.readingLabel,
        });
      } catch {
        // The generator has already written the agent_logs error row. Tell the
        // client to fall back to a single non-streamed retry.
        send({ error: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
