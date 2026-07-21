// Agent registry (Step 5). Every agent, one shape, one lookup point.
// Later steps (cron routes, feature endpoints) import agents from here.
//
// The brief's §6 table names 13 agents; Matching (Step 21) is the fourteenth —
// circle matching is a Gloo call with its own prompt and contract, so it is
// built as an agent like every other one rather than as a loose Gloo call.

import type { AnyAgent } from "./types";
import { planBuilder } from "./plan-builder";
import { preReading } from "./pre-reading";
import { postReading } from "./post-reading";
import { matching } from "./matching";
import { facilitator } from "./facilitator";
import { summary } from "./summary";
import { prayer } from "./prayer";
import { reminder } from "./reminder";
import { escalation } from "./escalation";
import { translation } from "./translation";
import { context } from "./context";
import { health } from "./health";
import { flashcard } from "./flashcard";
import { memory } from "./memory";

export const agents: readonly AnyAgent[] = [
  planBuilder,
  preReading,
  postReading,
  matching,
  facilitator,
  summary,
  prayer,
  reminder,
  escalation,
  translation,
  context,
  health,
  flashcard,
  memory,
];

export function getAgent(name: string): AnyAgent | undefined {
  return agents.find((agent) => agent.name === name);
}
