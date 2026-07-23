// Agent framework core (Step 5).
//
// Every agent in Round is a module conforming to Agent<Input, Output>: a
// name, its own system prompt, a typed input/output contract, and a run()
// entry point. Shells call the shared Gloo client (src/lib/gloo.ts), which
// logs every call to agent_logs automatically; stubs never reach Gloo, so
// the stub helper writes its own agent_logs row — either way, no invocation
// goes unlogged.

import { db } from "@/db";
import { agentLogs } from "@/db/schema";
import { chatCompletion } from "@/lib/gloo";

export type AgentName =
  | "plan-builder"
  | "pre-reading"
  | "post-reading"
  | "matching"
  | "facilitator"
  | "summary"
  | "companion"
  | "prayer"
  | "reminder"
  | "escalation"
  | "translation"
  | "context"
  | "health"
  | "flashcard"
  | "memory";

/** A successful run: the agent produced real output via Gloo. */
export interface AgentRunOk<Output> {
  status: "ok";
  agent: AgentName;
  /** Model that served the call, as reported by Gloo. */
  model: string;
  output: Output;
}

/** A stub run: the agent accepted its input and explicitly declined work. */
export interface AgentRunNotImplemented {
  status: "not_implemented";
  agent: AgentName;
  message: string;
  /** Echoed back so callers can verify the stub accepted the full contract. */
  receivedInput: unknown;
}

export type AgentResult<Output> = AgentRunOk<Output> | AgentRunNotImplemented;

export interface Agent<Input, Output> {
  name: AgentName;
  displayName: string;
  /** When it runs and what it is responsible for (from the brief §6). */
  description: string;
  tier: 1 | 2 | 3;
  /**
   * "real": the agent's plan step has landed and run() does its real job.
   * "shell": run() performs a real Gloo call with a placeholder prompt;
   * later steps replace prompt and output shape, not the structure.
   * "stub": run() is a logged no-op returning "not_implemented".
   */
  implementation: "real" | "shell" | "stub";
  systemPrompt: string;
  /** Example input rendered in the dev Agent Console trigger form. */
  sampleInput: Input;
  run(input: Input): Promise<AgentResult<Output>>;
}

/** Untyped view used by the registry and the dev console. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAgent = Agent<any, any>;

/** Default output contract for shell agents until their real step lands. */
export interface ShellOutput {
  text: string;
}

interface ShellAgentDefinition<Input> {
  name: AgentName;
  displayName: string;
  description: string;
  tier: 1 | 2 | 3;
  systemPrompt: string;
  sampleInput: Input;
  /** Serialises the typed input into the user message for the Gloo call. */
  buildUserMessage(input: Input): string;
  maxTokens?: number;
}

/**
 * A shell agent: real structure, real Gloo call, placeholder behaviour.
 * The Gloo client writes the agent_logs row for every run.
 */
export function shellAgent<Input>(
  definition: ShellAgentDefinition<Input>,
): Agent<Input, ShellOutput> {
  return {
    name: definition.name,
    displayName: definition.displayName,
    description: definition.description,
    tier: definition.tier,
    implementation: "shell",
    systemPrompt: definition.systemPrompt,
    sampleInput: definition.sampleInput,
    async run(input) {
      const completion = await chatCompletion({
        agentName: definition.name,
        messages: [
          { role: "system", content: definition.systemPrompt },
          { role: "user", content: definition.buildUserMessage(input) },
        ],
        maxTokens: definition.maxTokens ?? 400,
      });
      return {
        status: "ok",
        agent: definition.name,
        model: completion.model,
        output: { text: completion.content },
      };
    },
  };
}

interface StubAgentDefinition<Input> {
  name: AgentName;
  displayName: string;
  description: string;
  tier: 2 | 3;
  sampleInput: Input;
  /** Plan step at which the stub becomes a real implementation. */
  plannedStep: number;
}

/**
 * A functioning no-op stub (Tier 2/3): accepts its defined input, writes an
 * agent_logs row (it never reaches Gloo, so the shared client can't log it),
 * and returns an explicit "not implemented" result. The log insert is not
 * swallowed — a stub run whose only side effect fails should fail loudly.
 */
export function stubAgent<Input>(
  definition: StubAgentDefinition<Input>,
): Agent<Input, never> {
  const message = `${definition.displayName} is not implemented yet (planned for Step ${definition.plannedStep}).`;
  return {
    name: definition.name,
    displayName: definition.displayName,
    description: definition.description,
    tier: definition.tier,
    implementation: "stub",
    systemPrompt: "",
    sampleInput: definition.sampleInput,
    async run(input) {
      await db.insert(agentLogs).values({
        agentName: definition.name,
        status: "not_implemented",
        outputPreview: message,
      });
      return {
        status: "not_implemented",
        agent: definition.name,
        message,
        receivedInput: input,
      };
    },
  };
}
