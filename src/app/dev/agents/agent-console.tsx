"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";

export interface ConsoleAgent {
  name: string;
  displayName: string;
  description: string;
  tier: 1 | 2 | 3;
  implementation: "shell" | "stub";
  /** Pretty-printed JSON of the agent's sample input. */
  sampleInput: string;
}

interface RunState {
  running: boolean;
  /** Pretty-printed JSON of the last response, if any. */
  result?: string;
}

export function AgentConsole({ agents }: { agents: ConsoleAgent[] }) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Record<string, RunState>>({});

  async function trigger(agent: ConsoleAgent) {
    setRuns((previous) => ({ ...previous, [agent.name]: { running: true } }));
    let result: string;
    try {
      const response = await fetch(`/api/dev/agents/${agent.name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: inputs[agent.name] ?? agent.sampleInput,
      });
      result = JSON.stringify(await response.json(), null, 2);
    } catch (error) {
      result = error instanceof Error ? error.message : String(error);
    }
    setRuns((previous) => ({
      ...previous,
      [agent.name]: { running: false, result },
    }));
  }

  return (
    <div className="flex flex-col gap-4">
      {agents.map((agent) => {
        const run = runs[agent.name];
        return (
          <Card key={agent.name} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
                {agent.displayName}
              </h2>
              <Badge status="neutral">tier {agent.tier}</Badge>
              <Badge status={agent.implementation === "shell" ? "active" : "neutral"}>
                {agent.implementation}
              </Badge>
            </div>
            <p className="text-sm text-ink-soft">{agent.description}</p>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-primary">
                Input
              </summary>
              <textarea
                aria-label={`${agent.displayName} input JSON`}
                rows={8}
                className="mt-2 w-full rounded-md border border-line bg-surface p-2 font-mono text-sm text-ink focus:outline-2 focus:outline-offset-1 focus:outline-primary"
                value={inputs[agent.name] ?? agent.sampleInput}
                onChange={(event) =>
                  setInputs((previous) => ({
                    ...previous,
                    [agent.name]: event.target.value,
                  }))
                }
              />
            </details>
            <Button
              className="self-start"
              disabled={run?.running}
              onClick={() => trigger(agent)}
            >
              {run?.running ? "Running…" : "Trigger"}
            </Button>
            {run?.result && (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-surface-soft p-3 font-mono text-xs text-ink-soft">
                {run.result}
              </pre>
            )}
          </Card>
        );
      })}
    </div>
  );
}
