// PreReading Agent — real implementation (Step 15).
//
// When a user opens today's passage, generates 2–3 short personal reading
// prompts via Gloo, grounded in the passage text (fetched from YouVersion by
// the caller — never by Gloo), the user's onboarding goals, and relevant
// imported highlights. Prompts are personal and never shared with the circle.
// Generated directly in the user's language — no post-hoc translation.
//
// This module only talks to Gloo and shapes its JSON output. Fetching the
// passage for context, gathering goals/highlights, and the per-user-per-day
// caching live in src/lib/pre-reading.ts — nothing here reads the database.

import { chatCompletion } from "@/lib/gloo";
import type { Agent, AgentRunOk } from "./types";

export interface PreReadingInput {
  /** USFM-style reference of today's passage, e.g. "PSA.23". */
  passageReference: string;
  /** Passage text, fetched from YouVersion by the caller — never by Gloo. */
  passageText: string;
  /** The user's onboarding goals, if any. */
  goals?: string;
  /** Snippets of relevant imported highlights, if any. */
  highlights?: string[];
  /** ISO 639-1 code of the user's preferred language, e.g. "en". */
  language: string;
}

export interface PreReadingOutput {
  /** 2–3 short prompts, in the user's language. */
  prompts: string[];
}

const SYSTEM_PROMPT =
  "You are the PreReading agent for Round, an app for small-group Bible reading. " +
  "Before a user reads today's passage, you offer 2-3 short, personal prompts to hold while they read: " +
  "something to notice, a question to sit with, or a word or phrase to pay attention to. " +
  "Ground each prompt in the specific passage and, where it fits naturally, in the user's stated goals and past highlights. " +
  "Warm, brief, non-academic — one sentence each, never yes/no questions. " +
  "Write the prompts directly in the user's language. " +
  "Respond with JSON only — no prose, no markdown fences.";

/** Absent context is OMITTED, never sent as a "none"/"not stated" placeholder
 * — see the same note in src/agents/post-reading.ts for why (prompt hygiene,
 * and Gloo's whole-payload content guardrail). */
function buildUserMessage(input: PreReadingInput): string {
  const lines = [`Passage (${input.passageReference}):`, input.passageText, ""];

  if (input.goals?.trim()) {
    lines.push(`The user's goals: ${input.goals.trim()}`);
  }
  if (input.highlights && input.highlights.length > 0) {
    lines.push(
      `Phrases the user has highlighted before: ${input.highlights.join(" | ")}`,
    );
  }

  lines.push(
    `Write the prompts in this language (ISO 639-1): ${input.language}`,
    "",
    "Respond with exactly this JSON shape:",
    '{"prompts": ["<prompt 1>", "<prompt 2>", "<prompt 3>"]}',
    "Give exactly 2 or 3 prompts.",
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

/**
 * Coerce the model output into 2–3 non-empty prompt strings. Accepts either
 * a bare array or the documented `{ prompts: [...] }` shape; throws when
 * neither yields at least two usable prompts (the caller treats that as a
 * generation failure and hides the card).
 */
function asPrompts(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>).prompts
      : undefined;
  if (!Array.isArray(list)) {
    throw new Error("PreReading output is not a prompts array");
  }
  const prompts = list
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 3);
  if (prompts.length < 2) {
    throw new Error("PreReading returned fewer than 2 usable prompts");
  }
  return prompts;
}

/**
 * Run the Gloo call and shape its output. One re-ask on malformed JSON (the
 * parse failure fed back); transient HTTP errors are already retried inside
 * the Gloo client. Throws when both attempts fail — the caller turns that
 * into the silent hidden-card state, so reading never blocks on this.
 */
export async function generatePreReadingPrompts(
  input: PreReadingInput,
): Promise<{ prompts: string[]; model: string }> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const completion = await chatCompletion({
      agentName: "pre-reading",
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
      maxTokens: 400,
    });
    try {
      return { prompts: asPrompts(parseJson(completion.content)), model: completion.model };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`PreReading returned unusable prompts: ${lastError}`);
}

export const preReading: Agent<PreReadingInput, PreReadingOutput> = {
  name: "pre-reading",
  displayName: "PreReading",
  description:
    "Runs when a user opens a passage. Generates 2–3 personal reading prompts informed by the passage and the user's history. Never shared with the circle.",
  tier: 1,
  implementation: "real",
  systemPrompt: SYSTEM_PROMPT,
  sampleInput: {
    passageReference: "PSA.23",
    passageText:
      "The LORD is my shepherd, I lack nothing. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul.",
    goals: "Finding peace in a stressful season",
    highlights: [],
    language: "en",
  },
  async run(input): Promise<AgentRunOk<PreReadingOutput>> {
    const { prompts, model } = await generatePreReadingPrompts(input);
    return { status: "ok", agent: "pre-reading", model, output: { prompts } };
  },
};
