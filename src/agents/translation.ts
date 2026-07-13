// Translation Agent — shell (Step 5). Real implementation: Step 27, with
// language detection, per-target-language caching, and additive storage.
//
// Hard rule from the brief: Scripture is never an input to this agent.
// YouVersion delivers Bible text natively via version IDs; this agent only
// ever sees user-generated circle content.

import { shellAgent } from "./types";

export interface TranslationInput {
  /** User-generated message text. Never Bible text. */
  text: string;
  /** ISO code, if already detected; Step 27 adds detection. */
  sourceLanguage?: string;
  /** ISO code of the reader's preferred language. */
  targetLanguage: string;
}

export const translation = shellAgent<TranslationInput>({
  name: "translation",
  displayName: "Translation",
  description:
    "Runs on every new user message. Translates into each unique target language needed; caches results; never translates Bible text. Originals are never modified.",
  tier: 1,
  systemPrompt:
    "You are the Translation agent for Round, translating messages between members of a Bible reading circle. " +
    "Handle theological terms, pastoral tone, and scriptural references with care. " +
    "If the text is already in the target language, return it unchanged. Return only the translation, nothing else.",
  sampleInput: {
    text: "This verse about mercy stopped me today.",
    sourceLanguage: "en",
    targetLanguage: "es",
  },
  buildUserMessage: (input) =>
    `Source language: ${input.sourceLanguage ?? "detect"}\nTarget language: ${input.targetLanguage}\n\nText:\n${input.text}`,
  maxTokens: 300,
});
