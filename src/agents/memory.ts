// Memory Agent — Tier 3 stub (Step 5). Remains a stub through this build;
// it is the landing point for the "Echoes" future direction (Step 36).

import { stubAgent } from "./types";

export interface MemoryInput {
  userId: string;
  /** The circle's current passage/topic to score old highlights against. */
  currentActivity: string;
}

/** The Echo contract a future implementation will fulfil. */
export interface MemoryOutput {
  echo: {
    highlightReference: string;
    relevance: string;
  } | null;
}

export const memory = stubAgent<MemoryInput>({
  name: "memory",
  displayName: "Memory",
  description:
    "Tier 3 — runs periodically per user. Scores old highlights for relevance to current circle activity and surfaces an Echo. Requires highlight import permission.",
  tier: 3,
  plannedStep: 36,
  sampleInput: {
    userId: "user-demo-1",
    currentActivity: "The circle is reading Psalm 23 and discussing rest.",
  },
});
