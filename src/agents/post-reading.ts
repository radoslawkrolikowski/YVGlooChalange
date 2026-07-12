// PostReading Agent — shell (Step 5). Real implementation: Step 20, posting
// starters to the circle thread as "Round", idempotent per user+day.

import { shellAgent } from "./types";

export interface PostReadingInput {
  passageReference: string;
  /** Passage text, fetched from YouVersion by the caller. */
  passageText: string;
  /** Phrases the user highlighted during this reading session. */
  sessionHighlights?: string[];
  /** The pre-reading prompts this user was shown, for continuity. */
  preReadingPrompts?: string[];
  language: string;
}

export const postReading = shellAgent<PostReadingInput>({
  name: "post-reading",
  displayName: "PostReading",
  description:
    "Runs when a user finishes reading. Generates 2–3 circle-facing discussion starters grounded in the passage and session highlights, posted as 'Round'.",
  tier: 1,
  systemPrompt:
    "You are the PostReading agent for Round. After a user finishes a Bible passage, you write 2-3 discussion questions " +
    "for their small reading circle, grounded in the specific passage and what this user noticed. " +
    "Open-ended, warm, no yes/no questions. Respond in the user's language.",
  sampleInput: {
    passageReference: "PSA.23",
    passageText:
      "The LORD is my shepherd, I lack nothing. He makes me lie down in green pastures...",
    sessionHighlights: ["He makes me lie down in green pastures"],
    preReadingPrompts: [],
    language: "en",
  },
  buildUserMessage: (input) =>
    `Passage (${input.passageReference}):\n${input.passageText}\n\nUser's session highlights: ${input.sessionHighlights?.join(" | ") || "none"}\nPre-reading prompts shown: ${input.preReadingPrompts?.join(" | ") || "none"}\nLanguage: ${input.language}\n\nGive 2-3 discussion starters.`,
});
