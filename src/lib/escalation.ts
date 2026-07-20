// Escalation screening orchestration (Step 18).
//
// Wraps the Escalation agent's pure classifier (src/agents/escalation.ts) with
// the two side effects it must not own itself: the reference-only audit write
// and crisis-resource resolution. The agent module talks only to Gloo; every
// database and config touch lives here (mirrors the PreReading agent/lib
// split from Step 15).
//
// This module is NOT yet wired into any reflection submission — that pipeline
// is Step 19. In Step 18 only the dev test route calls screenReflection().

import { db } from "@/db";
import { escalationAudit } from "@/db/schema";
import { classifyReflection, type EscalationOutput } from "@/agents/escalation";
import {
  resolveCrisisResources,
  type CrisisResource,
} from "@/config/crisis-resources";

export interface ScreenReflectionInput {
  /** Reference to the reflection — the only thing written to the audit log. */
  reflectionId: string;
  /** The reflection text to classify. Never persisted anywhere. */
  text: string;
  /** Region to resolve resources for; omit for the combined default. */
  region?: string | null;
}

export interface ScreenReflectionResult {
  verdict: EscalationOutput;
  /** Model that served the classification, as reported by Gloo. */
  model: string;
  /**
   * Resources to show on the private support card — populated only when
   * flagged, so callers render the card iff this is non-empty.
   */
  resources: CrisisResource[];
}

/**
 * Screen one reflection: classify it, and when flagged, write the
 * reference-only audit row and resolve the region's crisis resources. Unflagged
 * reflections write nothing and return no resources. Throws if classification
 * is unusable after the agent's internal retry — callers fail safe (the
 * reflection is not accepted while the gate is unresolved).
 */
export async function screenReflection(
  input: ScreenReflectionInput,
): Promise<ScreenReflectionResult> {
  const { verdict, model } = await classifyReflection({
    reflectionId: input.reflectionId,
    text: input.text,
  });

  if (!verdict.flagged) {
    return { verdict, model, resources: [] };
  }

  // Reference only — never the text, a snippet, the category, or the author.
  await db.insert(escalationAudit).values({ reflectionRef: input.reflectionId });

  return {
    verdict,
    model,
    resources: resolveCrisisResources(input.region),
  };
}
