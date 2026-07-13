// Context Agent — Tier 2 stub (Step 5). Real implementation: Step 33, using
// Gloo Grounded Completions over the Psalms commentary corpus (Step 32) to
// hand modernised commentary grounding to the Facilitator, Psalms only.

import { stubAgent } from "./types";

export interface ContextInput {
  /** Passage reference for the circle's current day, e.g. "PSA.23". */
  passageReference: string;
  /** Preferred language for the restated commentary. */
  language: string;
}

/** Retrieved-and-modernised commentary handed to the Facilitator (Step 33). */
export interface ContextOutput {
  /** Plain modern-language commentary grounding, or null for non-Psalms. */
  grounding: string | null;
  /** Attribution line for the digest UI when RAG was used. */
  sourceAttribution: string | null;
}

export const context = stubAgent<ContextInput>({
  name: "context",
  displayName: "Context",
  description:
    "Tier 2 — runs before the Facilitator, Psalms only. Retrieves commentary from the RAG corpus, restates it in plain modern language, and passes it as grounding.",
  tier: 2,
  plannedStep: 33,
  sampleInput: {
    passageReference: "PSA.23",
    language: "en",
  },
});
