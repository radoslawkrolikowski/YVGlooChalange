// Facilitator Agent — real implementation (Step 24).
//
// Once a day, per circle, this reads the day's unflagged reflections and
// produces a digest: a 2–3 sentence collective synthesis, an overlap callout
// naming which members landed on the same theme or line, and one discussion
// question grounded in the passage and the circle's own words. It is CIRCLE-
// facing — posted to the thread attributed to "Round" — so it synthesises what
// members said without quizzing or singling anyone out negatively.
//
// This module only talks to Gloo and shapes its JSON output. Resolving the
// circle's current plan day, counting DISTINCT authors against the reflection
// threshold, fetching the passage (from YouVersion, never Gloo), posting to the
// thread, and the per-circle-per-day idempotency fence all live in
// src/lib/digest.ts — nothing here reads or writes the database.

import { chatCompletion } from "@/lib/gloo";
import type { Agent, AgentRunOk } from "./types";

export interface FacilitatorReflection {
  /** Display name only — never progress or streak data. */
  authorDisplayName: string;
  text: string;
}

export interface FacilitatorInput {
  passageReference: string;
  /** Passage text, fetched from YouVersion by the caller — never by Gloo. */
  passageText: string;
  /** The day's unflagged reflections (flagged ones are excluded upstream). */
  reflections: FacilitatorReflection[];
  /** Optional commentary grounding supplied by the Context agent (Step 33). */
  contextGrounding?: string;
  language: string;
}

/** The named overlap: which members converged, and on what. */
export interface FacilitatorOverlap {
  /** Display names of the converging members — a subset of the input authors. */
  members: string[];
  /** The shared theme or line they landed on, in the circle's own words. */
  theme: string;
}

export interface FacilitatorOutput {
  /** 2–3 sentence synthesis of what the circle noticed collectively. */
  synthesis: string;
  /** Overlap callout; members may be empty when no genuine overlap was found. */
  overlap: FacilitatorOverlap;
  /** One discussion question grounded in the passage and the circle's words. */
  question: string;
}

const SYSTEM_PROMPT =
  "You are the Facilitator agent for Round, an app for small-group Bible reading. " +
  "Once a day you read a circle's reflections on a Bible passage and write a short digest for the whole circle, posted under the name 'Round'. " +
  "The digest has three parts: " +
  "(1) synthesis — 2 to 3 sentences on what the circle noticed collectively, in warm plain language; " +
  "(2) overlap — name which members landed on the same theme or line, and state that shared theme in the circle's own words. " +
  "List a member only if their reflection genuinely converges with another's; if no two members overlap, return an empty members list and an empty theme. " +
  "Use the exact member names given to you, never invented ones; " +
  "(3) question — one open discussion question grounded in the specific passage AND the circle's own words, inviting replies. " +
  "Never compare members, never rank them, never mention who did or did not reflect, never quiz on facts. " +
  "You are sometimes given commentary grounding — background on the passage from a Bible commentary. " +
  "Use it to make the synthesis and question more accurate and concrete about the passage; never quote it, never cite it, and never let it displace what the members actually said. " +
  "Write every part directly in the requested language. " +
  "Respond with JSON only — no prose, no markdown fences.";

function buildUserMessage(input: FacilitatorInput): string {
  const lines = [
    `Passage (${input.passageReference}):`,
    input.passageText,
    "",
    "Reflections (member — what they wrote):",
    ...input.reflections.map(
      (reflection) => `- ${reflection.authorDisplayName}: ${reflection.text}`,
    ),
    "",
  ];

  if (input.contextGrounding) {
    lines.push(
      "Commentary grounding (background on this passage — inform the digest with it, do not quote it):",
      input.contextGrounding,
      "",
    );
  }

  lines.push(
    `Write every part in this language (ISO 639-1): ${input.language}`,
    "",
    "Respond with exactly this JSON shape:",
    '{"synthesis": "<2-3 sentences>", "overlap": {"members": ["<name>", "<name>"], "theme": "<shared theme in the circle\'s words>"}, "question": "<one discussion question>"}',
  );
  return lines.join("\n");
}

/** Parse the model's JSON, tolerating markdown fences it was told to skip. */
function parseJson(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  return JSON.parse(trimmed);
}

/** A trimmed non-empty string, or null. */
function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Coerce the model output into a well-formed digest. Requires a synthesis and a
 * question; throws otherwise (the caller treats that as a generation failure and
 * posts nothing). The overlap is shaped leniently — an absent or malformed
 * overlap becomes "no overlap" (empty members) rather than a hard failure, since
 * a genuine no-overlap day is valid. Member names are NOT trusted here: the
 * caller validates them against the day's actual authors before display.
 */
function asDigest(raw: unknown): FacilitatorOutput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Facilitator output is not an object");
  }
  const record = raw as Record<string, unknown>;

  const synthesis = asText(record.synthesis);
  const question = asText(record.question);
  if (!synthesis) throw new Error("Facilitator output has no synthesis");
  if (!question) throw new Error("Facilitator output has no question");

  const overlapRaw = record.overlap;
  let members: string[] = [];
  let theme = "";
  if (typeof overlapRaw === "object" && overlapRaw !== null) {
    const overlap = overlapRaw as Record<string, unknown>;
    if (Array.isArray(overlap.members)) {
      members = overlap.members
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
    theme = asText(overlap.theme) ?? "";
  }
  // A theme with no named members, or members with no theme, is incoherent —
  // collapse it to a clean "no overlap" rather than render a half callout.
  if (members.length === 0 || theme.length === 0) {
    members = [];
    theme = "";
  }

  return { synthesis, overlap: { members, theme }, question };
}

/**
 * Run the Gloo call and shape its output. One re-ask on malformed JSON (the
 * parse failure fed back); transient HTTP errors are already retried inside the
 * Gloo client. Throws when both attempts fail — the caller then posts nothing,
 * so a bad generation is invisible rather than ugly.
 */
export async function generateDigest(
  input: FacilitatorInput,
): Promise<{ digest: FacilitatorOutput; model: string }> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const completion = await chatCompletion({
      agentName: "facilitator",
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
      maxTokens: 500,
    });
    try {
      return {
        digest: asDigest(parseJson(completion.content)),
        model: completion.model,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Facilitator returned an unusable digest: ${lastError}`);
}

export const facilitator: Agent<FacilitatorInput, FacilitatorOutput> = {
  name: "facilitator",
  displayName: "Facilitator",
  description:
    "Runs daily per circle. Synthesises the day's reflections into a digest: collective synthesis, overlap callout naming members on the same theme, and one grounded discussion question.",
  tier: 1,
  implementation: "real",
  systemPrompt: SYSTEM_PROMPT,
  sampleInput: {
    passageReference: "PSA.23",
    passageText:
      "The LORD is my shepherd, I lack nothing. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul.",
    reflections: [
      {
        authorDisplayName: "Ana",
        text: "The still waters line stopped me — I never slow down.",
      },
      {
        authorDisplayName: "Ben",
        text: "Still waters again. I keep rushing past rest like it is optional.",
      },
    ],
    language: "en",
  },
  async run(input): Promise<AgentRunOk<FacilitatorOutput>> {
    const { digest, model } = await generateDigest(input);
    return { status: "ok", agent: "facilitator", model, output: digest };
  },
};
