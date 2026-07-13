"use client";

import { useState } from "react";

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
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {agents.map((agent) => {
        const run = runs[agent.name];
        return (
          <section
            key={agent.name}
            style={{
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
              {agent.displayName}{" "}
              <small style={{ fontWeight: "normal", color: "#666" }}>
                tier {agent.tier} · {agent.implementation}
              </small>
            </h2>
            <p style={{ margin: "0.5rem 0", color: "#444" }}>
              {agent.description}
            </p>
            <details>
              <summary>Input</summary>
              <textarea
                aria-label={`${agent.displayName} input JSON`}
                rows={8}
                style={{ width: "100%", fontFamily: "monospace" }}
                value={inputs[agent.name] ?? agent.sampleInput}
                onChange={(event) =>
                  setInputs((previous) => ({
                    ...previous,
                    [agent.name]: event.target.value,
                  }))
                }
              />
            </details>
            <button
              type="button"
              disabled={run?.running}
              onClick={() => trigger(agent)}
              style={{ marginTop: "0.5rem", padding: "0.4rem 1rem" }}
            >
              {run?.running ? "Running…" : "Trigger"}
            </button>
            {run?.result && (
              <pre
                style={{
                  marginTop: "0.5rem",
                  padding: "0.5rem",
                  background: "#f5f5f5",
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {run.result}
              </pre>
            )}
          </section>
        );
      })}
    </div>
  );
}
