// Cold-start icebreaker — generation (Step 22).
//
// When a circle reaches minimum size (2) and flips forming → active, Round
// opens the conversation itself: there is no blank "say hi" state (brief §5.2).
// This module turns two members' real onboarding answers into one short, warm
// opening message that references something specific each of them said, so the
// first thing every new circle sees is that Round already knows why they came.
//
// It only talks to Gloo and shapes its text output. Claiming the per-circle
// idempotency slot, loading the members' answers, and posting to the thread
// live in src/lib/icebreaker.ts — nothing here reads or writes the database.
//
// Not a registered agent in the Step 5 framework: the icebreaker fires on the
// activation transition, not from the Agent Console, and has no recurring
// trigger. It still calls the shared Gloo client (agentName "icebreaker"), so
// the call is logged to agent_logs like every other — the brief's "all agent
// outputs are logged" rule holds by construction.

import { chatCompletion } from "@/lib/gloo";

/** One member's onboarding answers, already resolved to human-readable text. */
export interface IcebreakerMember {
  /** Display name — used to address the member warmly, never a login id. */
  name: string;
  /** Free-text goal ("understand the Psalms in hard times"); "" when unset. */
  goals: string;
  /** "Find comfort", "Build a habit", … — the motivation label, or null. */
  motivation: string | null;
  /** "Grief or loss", "Parenting", … — the life-season label, or null. */
  lifeSeason: string | null;
  /** Topic labels the member chose ("Forgiveness", "Prayer"), possibly empty. */
  topics: string[];
  /** What they hope for from a circle ("Encouragement"), possibly empty. */
  circleHopes: string[];
}

export interface IcebreakerInput {
  /** The two members whose answers ground the opening message. */
  members: [IcebreakerMember, IcebreakerMember];
  /** The plan the circle reads, e.g. "Psalms in 30 days" — light framing. */
  planName: string;
  /** ISO 639-1 code of the language to write the message in, e.g. "en". */
  language: string;
}

const SYSTEM_PROMPT =
  "You are Round, the gentle facilitator of a small Bible-reading circle. " +
  "Two readers have just formed a circle, and you post the very first message to open the conversation — there is no blank 'say hi' prompt, you break the ice yourself. " +
  "Write ONE short, warm welcome (2-4 sentences) addressed to the whole circle. " +
  "Reference something SPECIFIC from each reader's own onboarding answers by name — what they said they want, the season they are in, or a topic they care about — so each of them sees you already know why they came. " +
  "Then offer one light, open invitation for them to introduce themselves or share what drew them here. " +
  "Warm, plain, unhurried; never clinical, never a bulleted list. Do not quiz, do not counsel, do not compare the two readers or rank who is further along. " +
  "Write directly in the requested language. " +
  "Respond with JSON only — no prose, no markdown fences.";

/** Render one member's answers as prompt lines, omitting anything unset. */
function memberLines(member: IcebreakerMember, position: number): string {
  const lines = [`Reader ${position} — ${member.name}:`];
  if (member.goals.trim()) lines.push(`  wants: ${member.goals.trim()}`);
  if (member.motivation) lines.push(`  here to: ${member.motivation}`);
  if (member.lifeSeason) lines.push(`  season: ${member.lifeSeason}`);
  if (member.topics.length > 0)
    lines.push(`  cares about: ${member.topics.join(", ")}`);
  if (member.circleHopes.length > 0)
    lines.push(`  hopes from a circle: ${member.circleHopes.join(", ")}`);
  return lines.join("\n");
}

/**
 * Absent context is OMITTED, never sent as a "none" placeholder — same
 * discipline as the PostReading agent: empty placeholder lines both dilute the
 * prompt and give Gloo's content guardrail more surface to over-score benign
 * input (see GlooGuardrailError in src/lib/gloo.ts).
 */
function buildUserMessage(input: IcebreakerInput): string {
  const [first, second] = input.members;
  return [
    `This circle is reading: ${input.planName}.`,
    "",
    "The two founding readers, in their own onboarding answers:",
    memberLines(first, 1),
    memberLines(second, 2),
    "",
    `Write the welcome in this language (ISO 639-1): ${input.language}`,
    "",
    "Respond with exactly this JSON shape:",
    '{"message": "<the welcome message>"}',
  ].join("\n");
}

/** Parse the model's JSON, tolerating markdown fences it was told to skip. */
function parseJson(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  return JSON.parse(trimmed);
}

/**
 * Coerce the model output into a single non-empty message string. Accepts the
 * documented `{ message: "…" }` shape or a bare string; throws when neither
 * yields usable text (the caller treats that as a generation failure, posts
 * nothing, and releases its claim so a later join can retry).
 */
function asMessage(raw: unknown): string {
  const value =
    typeof raw === "string"
      ? raw
      : typeof raw === "object" && raw !== null
        ? (raw as Record<string, unknown>).message
        : undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Icebreaker output has no usable message");
  }
  return value.trim();
}

/**
 * Run the Gloo call and shape its output. One re-ask on malformed JSON (the
 * parse failure fed back); transient HTTP errors are already retried inside the
 * Gloo client. Throws when both attempts fail — the caller then posts nothing,
 * so a bad generation is invisible rather than an ugly card.
 */
export async function generateIcebreaker(
  input: IcebreakerInput,
): Promise<{ message: string; model: string }> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const completion = await chatCompletion({
      agentName: "icebreaker",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            buildUserMessage(input) +
            (lastError
              ? `\n\nYour previous answer was invalid (${lastError}). Return only the corrected JSON.`
              : ""),
        },
      ],
      maxTokens: 800,
    });
    try {
      return { message: asMessage(parseJson(completion.content)), model: completion.model };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Icebreaker returned unusable output: ${lastError}`);
}
