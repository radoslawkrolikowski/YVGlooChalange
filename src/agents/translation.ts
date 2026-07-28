// Translation Agent — real implementation (Step 27).
//
// Runs on every new user-generated message, reflection, or shared prayer.
// Translates the author's words into each distinct reader language present in
// the circle that differs from the source, caching one row per (message,
// target language) so a message is never re-translated for the same language.
//
// Hard rule from the brief (§5.12): Scripture is never an input to this agent.
// YouVersion delivers Bible text natively via version IDs; this agent only
// ever sees user-generated circle content. AI-authored posts (authorId null)
// are never translated after the fact either — those are generated per-language
// in Step 28. Both exclusions are enforced by the orchestration in
// src/lib/translation.ts; this module only talks to Gloo and shapes text.
//
// Two Gloo shapes live here:
//   * translateText() — one faith-context translation call, the agent's job.
//   * detectLanguage() — one detection call, used ONLY as the fallback tier
//     when the cheap English-regex check in src/lib/translation.ts is
//     inconclusive (Decisions → language detection). English messages never
//     reach it, so English posts cost no detection call at all.

import { chatCompletion } from "@/lib/gloo";
import type { Agent, AgentRunOk } from "./types";

export interface TranslationInput {
  /** User-generated message text. Never Bible text. */
  text: string;
  /** ISO 639-1 code of the source, when already known. */
  sourceLanguage?: string;
  /** ISO 639-1 code of the reader's preferred language. */
  targetLanguage: string;
}

export interface TranslationOutput {
  /** The translated text — additive; the original is never modified. */
  text: string;
}

const TRANSLATE_SYSTEM_PROMPT =
  "You are the Translation agent for Round, a Bible reading circle. You translate one member's message so another member can read it in their own language. " +
  "Handle theological terms, pastoral tone, and scriptural references with care — this faith-aware fidelity is the whole reason a general translator is not used. " +
  "Preserve the author's voice, warmth, and meaning exactly; do not soften, expand, summarise, or add commentary. " +
  "Leave Scripture references (e.g. 'Psalm 23', 'John 3:16') as written — never translate or re-verse them. " +
  "If the text is already in the target language, return it unchanged. " +
  "Respond with ONLY the translated text — no quotation marks, no notes, no preamble.";

const DETECT_SYSTEM_PROMPT =
  "You identify the language of a short message. " +
  "Respond with ONLY the ISO 639-1 two-letter language code (e.g. 'en', 'es', 'pt'), lowercase, nothing else.";

function buildTranslateMessage(input: TranslationInput): string {
  return [
    `Source language (ISO 639-1): ${input.sourceLanguage ?? "unknown"}`,
    `Target language (ISO 639-1): ${input.targetLanguage}`,
    "",
    "Message to translate:",
    input.text,
  ].join("\n");
}

/** Strip stray quotes/fences a model may wrap the output in. */
function clean(content: string): string {
  return content
    .trim()
    .replace(/^```(?:\w+)?\s*/i, "")
    .replace(/```\s*$/, "")
    .replace(/^["“](.*)["”]$/s, "$1")
    .trim();
}

/**
 * One faith-context translation call. Transient HTTP errors are already
 * retried inside the Gloo client; an empty result throws so the caller stores
 * no translation rather than an empty one.
 */
export async function translateText(
  input: TranslationInput,
): Promise<{ output: TranslationOutput; model: string }> {
  const completion = await chatCompletion({
    agentName: "translation",
    messages: [
      { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
      { role: "user", content: buildTranslateMessage(input) },
    ],
    maxTokens: 1200,
  });
  const text = clean(completion.content);
  if (text.length === 0) {
    throw new Error("Translation returned empty text");
  }
  return { output: { text }, model: completion.model };
}

/**
 * The detection fallback tier: one Gloo call returning an ISO 639-1 code.
 * Only reached when the English-regex short-circuit is inconclusive, so it is
 * never spent on English messages. Returns null when Gloo answers with
 * something that is not a plausible two-letter code, letting the caller fall
 * back to the author's profile language.
 */
export async function detectLanguage(text: string): Promise<string | null> {
  const completion = await chatCompletion({
    agentName: "translation",
    messages: [
      { role: "system", content: DETECT_SYSTEM_PROMPT },
      { role: "user", content: text.slice(0, 500) },
    ],
    // Room for a reasoning model's thinking tokens, which come out of this
    // budget — at 8 such a model spent the lot on thinking and returned an
    // empty answer, silently demoting every detection to the profile-language
    // fallback. The answer itself is still one code: `slice(0, 2)` below is the
    // real bound, and a budget stop here is expected rather than a defect.
    maxTokens: 200,
    allowTruncated: true,
  });
  const code = clean(completion.content).toLowerCase().slice(0, 2);
  return /^[a-z]{2}$/.test(code) ? code : null;
}

export const translation: Agent<TranslationInput, TranslationOutput> = {
  name: "translation",
  displayName: "Translation",
  description:
    "Runs on every new user message, reflection, or shared prayer. Translates into each unique target language a circle needs; caches per target language; never translates Bible text. Originals are never modified.",
  tier: 1,
  implementation: "real",
  systemPrompt: TRANSLATE_SYSTEM_PROMPT,
  sampleInput: {
    text: "This verse about mercy stopped me today.",
    sourceLanguage: "en",
    targetLanguage: "es",
  },
  async run(input): Promise<AgentRunOk<TranslationOutput>> {
    const { output, model } = await translateText(input);
    return { status: "ok", agent: "translation", model, output };
  },
};
