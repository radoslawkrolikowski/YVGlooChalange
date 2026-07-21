// PostReading Agent — real implementation (Step 20).
//
// When the FIRST member of a circle finishes a day's reading, generates 2–3
// circle-facing discussion questions via Gloo, grounded in the specific passage
// (fetched from YouVersion by the caller — never by Gloo), the phrases that
// member highlighted during their reading session, and the pre-reading prompts
// they were shown (Step 15), so the circle's conversation continues the thread
// that reader was already pulling on. One card per circle per day: later
// finishers do not each get their own (see src/lib/post-reading.ts).
//
// Unlike the PreReading agent's output, these are CIRCLE-facing: they are
// posted to the thread attributed to "Round". They must therefore never reveal
// what the member privately highlighted or was prompted with — the highlights
// steer the questions, they are not quoted back at the circle.
//
// This module only talks to Gloo and shapes its JSON output. Fetching the
// passage, gathering highlights and prompts, posting to the thread, and the
// per-user-per-plan-day idempotency fence live in src/lib/post-reading.ts —
// nothing here reads or writes the database.

import { chatCompletion } from "@/lib/gloo";
import type { Agent, AgentRunOk } from "./types";

export interface PostReadingInput {
  /** USFM-style reference of the passage just read, e.g. "PSA.23". */
  passageReference: string;
  /** Passage text, fetched from YouVersion by the caller — never by Gloo. */
  passageText: string;
  /** Phrases the user highlighted during this reading session. */
  sessionHighlights?: string[];
  /** The pre-reading prompts this user was shown, for continuity. */
  preReadingPrompts?: string[];
  /** ISO 639-1 code of the language to write the questions in, e.g. "en". */
  language: string;
}

export interface PostReadingOutput {
  /** 2–3 discussion questions for the circle, in the user's language. */
  questions: string[];
}

const SYSTEM_PROMPT =
  "You are the PostReading agent for Round, an app for small-group Bible reading. " +
  "A member has just finished today's passage. You write 2-3 discussion questions for their reading circle — " +
  "a starting point for the group's conversation, posted under the name 'Round'. " +
  "Ground every question in the specific passage: refer to its actual images, lines, or turns of thought. " +
  "One question should follow what this reader noticed while reading, but write it so the whole circle can answer it — " +
  "never say that a particular member highlighted or was asked anything, and never address one person. " +
  "Open-ended, warm, plain language, one sentence each. No yes/no questions, no quizzing on facts, no homework. " +
  "Write the questions directly in the requested language. " +
  "Respond with JSON only — no prose, no markdown fences.";

/**
 * Absent context is OMITTED, never sent as a "none" placeholder.
 *
 * Two reasons, one of them load-bearing. Prompt hygiene: a line saying a
 * reader highlighted nothing is filler that dilutes the real context. And
 * Gloo's content guardrail scores the whole payload — the empty-context
 * placeholder lines were part of a combination that got benign passages
 * (John 13:12-17 reproducibly) refused as "sexually explicit". Sending no line
 * at all removes the surface entirely, where a different placeholder ("N/A",
 * "[]") would just be another string for the classifier to score. See
 * GlooGuardrailError in src/lib/gloo.ts.
 */
function buildUserMessage(input: PostReadingInput): string {
  const lines = [`Passage (${input.passageReference}):`, input.passageText, ""];

  if (input.sessionHighlights && input.sessionHighlights.length > 0) {
    lines.push(
      `Phrases this reader highlighted while reading: ${input.sessionHighlights.join(" | ")}`,
    );
  }
  if (input.preReadingPrompts && input.preReadingPrompts.length > 0) {
    lines.push(
      `Pre-reading prompts this reader was shown: ${input.preReadingPrompts.join(" | ")}`,
    );
  }

  lines.push(
    `Write the questions in this language (ISO 639-1): ${input.language}`,
    "",
    "Respond with exactly this JSON shape:",
    '{"questions": ["<question 1>", "<question 2>", "<question 3>"]}',
    "Give exactly 2 or 3 questions.",
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
 * Coerce the model output into 2–3 non-empty question strings. Accepts either
 * a bare array or the documented `{ questions: [...] }` shape; throws when
 * neither yields at least two usable questions (the caller treats that as a
 * generation failure and posts nothing).
 */
function asQuestions(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>).questions
      : undefined;
  if (!Array.isArray(list)) {
    throw new Error("PostReading output is not a questions array");
  }
  const questions = list
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 3);
  if (questions.length < 2) {
    throw new Error("PostReading returned fewer than 2 usable questions");
  }
  return questions;
}

/**
 * Run the Gloo call and shape its output. One re-ask on malformed JSON (the
 * parse failure fed back); transient HTTP errors are already retried inside
 * the Gloo client. Throws when both attempts fail — the caller then posts
 * nothing to the thread, so a bad generation is invisible rather than ugly.
 */
export async function generateConversationStarters(
  input: PostReadingInput,
): Promise<{ questions: string[]; model: string }> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const completion = await chatCompletion({
      agentName: "post-reading",
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
      return {
        questions: asQuestions(parseJson(completion.content)),
        model: completion.model,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`PostReading returned unusable questions: ${lastError}`);
}

export const postReading: Agent<PostReadingInput, PostReadingOutput> = {
  name: "post-reading",
  displayName: "PostReading",
  description:
    "Runs when a user finishes reading. Generates 2–3 circle-facing discussion starters grounded in the passage and session highlights, posted as 'Round'.",
  tier: 1,
  implementation: "real",
  systemPrompt: SYSTEM_PROMPT,
  sampleInput: {
    passageReference: "PSA.23",
    passageText:
      "The LORD is my shepherd, I lack nothing. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul.",
    sessionHighlights: ["He makes me lie down in green pastures"],
    preReadingPrompts: [],
    language: "en",
  },
  async run(input): Promise<AgentRunOk<PostReadingOutput>> {
    const { questions, model } = await generateConversationStarters(input);
    return { status: "ok", agent: "post-reading", model, output: { questions } };
  },
};
