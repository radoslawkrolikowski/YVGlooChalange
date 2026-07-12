// PlanBuilder Agent — shell (Step 5). Real implementation: Step 12, where
// output becomes a structured day-by-day plan validated against YouVersion.

import { shellAgent } from "./types";

export interface PlanBuilderInput {
  /** Onboarding: what the user wants to learn / why they want to read. */
  goals: string;
  /** Available reading time per day, e.g. "10 minutes". */
  timePerDay: string;
  topics: string[];
  /** Plan length the user asked for, e.g. "2 weeks". */
  duration: string;
  /** ISO code of the user's preferred language, e.g. "en". */
  language: string;
}

export const planBuilder = shellAgent<PlanBuilderInput>({
  name: "plan-builder",
  displayName: "PlanBuilder",
  description:
    "Runs at onboarding or on request. Generates a day-by-day reading plan from the user's goals; every reference is validated against YouVersion before saving (Step 12).",
  tier: 1,
  systemPrompt:
    "You are the PlanBuilder agent for Round, an app for small-group Bible reading. " +
    "You design day-by-day Bible reading plans from a user's stated goals, available time, and topics of interest. " +
    "Respond in the user's language.",
  sampleInput: {
    goals: "Learn about forgiveness",
    timePerDay: "10 minutes",
    topics: ["forgiveness", "grace"],
    duration: "2 weeks",
    language: "en",
  },
  buildUserMessage: (input) =>
    `Sketch a short Bible reading plan.\nGoals: ${input.goals}\nTime per day: ${input.timePerDay}\nTopics: ${input.topics.join(", ")}\nDuration: ${input.duration}\nLanguage: ${input.language}`,
});
