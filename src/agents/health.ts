// Health Agent — Tier 2 stub (Step 5). Real implementation: Step 34, on the
// 12-hourly cron sweep, classifying circle health and acting autonomously
// with every decision logged with full reasoning.

import { stubAgent } from "./types";

export interface HealthInput {
  circleId: string;
  /** Engagement signals gathered by the sweep before invoking the agent. */
  signals: {
    daysSinceLastReflection: number;
    responseRate: number;
    silentMemberCount: number;
  };
}

/** The decision contract Step 34 will fulfil. */
export interface HealthOutput {
  classification: "healthy" | "at_risk" | "stalled";
  action: "none" | "nudge" | "bridge" | "propose_merge";
  /** Full written reasoning — logged for every decision, per the brief. */
  reasoning: string;
}

export const health = stubAgent<HealthInput>({
  name: "health",
  displayName: "Health",
  description:
    "Tier 2 — runs every 12 hours per circle. Autonomously classifies circle health (healthy/at-risk/stalled) and acts: nudge, bridge, or merge. Every decision logged with reasoning.",
  tier: 2,
  plannedStep: 34,
  sampleInput: {
    circleId: "circle-demo-1",
    signals: {
      daysSinceLastReflection: 5,
      responseRate: 0.2,
      silentMemberCount: 2,
    },
  },
});
