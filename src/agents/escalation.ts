// Escalation Agent — real implementation (Step 18).
//
// Classifies a user's reflection text for crisis signals via Gloo:
// suicidal ideation, self-harm, acute crisis, complete hopelessness. Returns
// a structured flagged/unflagged verdict. It never counsels, never replies to
// the user, and never stores the text — this module only talks to Gloo and
// shapes the JSON verdict (like the PreReading agent, nothing here reads or
// writes the database). Audit logging (reference only), resource resolution,
// and — from Step 19 — running this first on every reflection live in
// src/lib/escalation.ts.
//
// The Gloo client (src/lib/gloo.ts) writes the agent_logs row for the call.
// Only the MODEL's JSON verdict is ever previewed there, never the user's
// input, so agent_logs stays content-free for this agent by construction.

import { chatCompletion } from "@/lib/gloo";
import type { Agent, AgentRunOk } from "./types";

/** The four crisis-signal categories the classifier reports (brief §5.11). */
export const CRISIS_SIGNALS = [
  "suicidal_ideation",
  "self_harm",
  "acute_crisis",
  "complete_hopelessness",
] as const;

export type CrisisSignal = (typeof CRISIS_SIGNALS)[number];

export interface EscalationInput {
  /** Reference to the reflection being checked — the only thing ever logged. */
  reflectionId: string;
  /** The reflection text to classify. Never stored in any log. */
  text: string;
}

export interface EscalationOutput {
  /** True when any crisis signal is present — drives the private support card. */
  flagged: boolean;
  /** Which signals the classifier detected (metadata, never the user's words). */
  signals: CrisisSignal[];
}

const SYSTEM_PROMPT =
  "You are the Escalation agent for Round, a Scripture reading app. Your only job is to detect " +
  "whether a user's reflection text contains a genuine crisis signal that warrants offering support " +
  "resources. Classify for exactly these signals: suicidal_ideation (thoughts of ending one's life), " +
  "self_harm (intent or urge to hurt oneself), acute_crisis (an immediate danger or emergency the person " +
  "is in), complete_hopelessness (total, pervasive hopelessness with no sense of a way forward). " +
  "Ordinary sadness, lament, spiritual struggle, doubt, grief, or heavy reflection are NOT crisis " +
  "signals — the Psalms are full of anguish and that alone must not flag. Flag only clear, present " +
  "signals in the four categories. You do not counsel, reply, or address the user; you only classify. " +
  'Respond with JSON only — no prose, no markdown fences — in exactly this shape: ' +
  '{"flagged": <boolean>, "signals": ["suicidal_ideation" | "self_harm" | "acute_crisis" | "complete_hopelessness", ...]} ' +
  "where signals is empty when flagged is false and lists only detected categories when flagged is true.";

function buildUserMessage(input: EscalationInput): string {
  return [
    "Classify the following reflection for crisis signals.",
    "",
    "Reflection:",
    input.text,
  ].join("\n");
}

/** Parse the model's JSON, tolerating markdown fences it was told to skip. */
function parseJson(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  return JSON.parse(trimmed);
}

/** Coerce raw model output into a strict verdict; throws on unusable shapes. */
function asVerdict(raw: unknown): EscalationOutput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Escalation output is not an object");
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.flagged !== "boolean") {
    throw new Error("Escalation output missing boolean `flagged`");
  }
  const rawSignals = Array.isArray(record.signals) ? record.signals : [];
  const signals = rawSignals.filter((item): item is CrisisSignal =>
    (CRISIS_SIGNALS as readonly string[]).includes(item as string),
  );
  // Keep flagged and signals consistent: a flag with no recognised signal is
  // still a flag (the model saw something) — surface it as acute_crisis so the
  // support card always has a reason; recognised signals imply flagged.
  const flagged = record.flagged || signals.length > 0;
  if (flagged && signals.length === 0) {
    return { flagged: true, signals: ["acute_crisis"] };
  }
  return { flagged, signals };
}

/**
 * Classify one reflection. One re-ask on malformed JSON (the parse error fed
 * back); transient HTTP errors are already retried inside the Gloo client.
 * Throws when both attempts fail — the caller (Step 19 pipeline) decides how
 * to fail safe; a reflection is never posted while the gate is unresolved.
 */
export async function classifyReflection(
  input: EscalationInput,
): Promise<{ verdict: EscalationOutput; model: string }> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const completion = await chatCompletion({
      agentName: "escalation",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            buildUserMessage(input) +
            (lastError
              ? `\n\nYour previous answer was invalid (${lastError}). Return only the corrected JSON.`
              : ""),
        },
      ],
      // Deterministic classification — no creativity wanted on a safety gate.
      temperature: 0,
      maxTokens: 120,
    });
    try {
      return { verdict: asVerdict(parseJson(completion.content)), model: completion.model };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Escalation returned an unusable verdict: ${lastError}`);
}

export const escalation: Agent<EscalationInput, EscalationOutput> = {
  name: "escalation",
  displayName: "Escalation",
  description:
    "Runs on every reflection, immediately and before any other agent. Detects crisis signals; a private support card is shown to the affected user only; logs reference only, never content.",
  tier: 1,
  implementation: "real",
  systemPrompt: SYSTEM_PROMPT,
  sampleInput: {
    reflectionId: "reflection-demo-1",
    text: "This psalm reminded me to slow down and breathe this week.",
  },
  async run(input): Promise<AgentRunOk<EscalationOutput>> {
    const { verdict, model } = await classifyReflection(input);
    return { status: "ok", agent: "escalation", model, output: verdict };
  },
};
