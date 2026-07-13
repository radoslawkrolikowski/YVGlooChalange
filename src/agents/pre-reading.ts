// PreReading Agent — shell (Step 5). Real implementation: Step 15, with
// passage context from YouVersion, per-user-per-day caching, and highlights.

import { shellAgent } from "./types";

export interface PreReadingInput {
  /** USFM-style reference of today's passage, e.g. "PSA.23". */
  passageReference: string;
  /** Passage text, fetched from YouVersion by the caller — never by Gloo. */
  passageText: string;
  /** The user's onboarding goals, if any. */
  goals?: string;
  /** Snippets of relevant imported highlights, if any. */
  highlights?: string[];
  language: string;
}

export const preReading = shellAgent<PreReadingInput>({
  name: "pre-reading",
  displayName: "PreReading",
  description:
    "Runs when a user opens a passage. Generates 2–3 personal reading prompts informed by the passage and the user's history. Never shared with the circle.",
  tier: 1,
  systemPrompt:
    "You are the PreReading agent for Round. Before a user reads a Bible passage, you offer 2-3 short personal prompts: " +
    "things to notice, questions to hold while reading, a word or phrase to pay attention to. " +
    "Warm, brief, non-academic. Respond in the user's language.",
  sampleInput: {
    passageReference: "PSA.23",
    passageText:
      "The LORD is my shepherd, I lack nothing. He makes me lie down in green pastures...",
    goals: "Finding peace in a stressful season",
    highlights: [],
    language: "en",
  },
  buildUserMessage: (input) =>
    `Passage (${input.passageReference}):\n${input.passageText}\n\nUser goals: ${input.goals ?? "not stated"}\nPast highlights: ${input.highlights?.join(" | ") || "none"}\nLanguage: ${input.language}\n\nGive 2-3 pre-reading prompts.`,
});
