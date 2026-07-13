// Flashcard Agent — Tier 2 stub (Step 5). Real implementation: Step 35,
// generating a 3–5 card deck on user request after completing a reading.

import { stubAgent } from "./types";

export interface FlashcardInput {
  passageReference: string;
  /** Passage text, fetched from YouVersion by the caller. */
  passageText: string;
  language: string;
}

/** The deck contract Step 35 will fulfil. */
export interface FlashcardOutput {
  cards: Array<{
    /** Key verse or concept. */
    front: string;
    /** Short explanation or question. */
    back: string;
    passageReference: string;
  }>;
}

export const flashcard = stubAgent<FlashcardInput>({
  name: "flashcard",
  displayName: "Flashcard",
  description:
    "Tier 2 — runs on user request after reading. Generates a 3–5 card deck from the passage, each card linked to the passage reference.",
  tier: 2,
  plannedStep: 35,
  sampleInput: {
    passageReference: "PSA.23",
    passageText:
      "The LORD is my shepherd, I lack nothing. He makes me lie down in green pastures...",
    language: "en",
  },
});
