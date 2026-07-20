"use client";

import { useState } from "react";
import { Badge, Button, Card, SupportCard } from "@/components/ui";
import type { CrisisResource } from "@/config/crisis-resources";

interface ScreenResponse {
  ok: boolean;
  reflectionId?: string;
  flagged?: boolean;
  signals?: string[];
  model?: string;
  resources?: CrisisResource[];
  audited?: boolean;
  error?: string;
}

const REGIONS = [
  { value: "", label: "Default (US + UK)" },
  { value: "US", label: "US" },
  { value: "GB", label: "UK" },
] as const;

// Dev-only tester (Step 18): submit arbitrary text to the Escalation
// classifier and see the verdict, the audit outcome, and — when flagged —
// the real SupportCard component rendered with the resolved resources.
export function EscalationTester() {
  const [text, setText] = useState("");
  const [region, setRegion] = useState("");
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<ScreenResponse | null>(null);

  async function run() {
    setRunning(true);
    setResponse(null);
    try {
      const res = await fetch("/api/dev/escalation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, region: region || undefined }),
      });
      setResponse(await res.json());
    } catch (error) {
      setResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRunning(false);
    }
  }

  const flagged = response?.ok && response.flagged;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <label
          htmlFor="reflection-text"
          className="text-sm font-medium text-ink"
        >
          Reflection text
        </label>
        <textarea
          id="reflection-text"
          rows={5}
          placeholder="Type a benign reflection, or crisis-signal test text…"
          className="w-full rounded-md border border-line bg-surface p-3 text-sm text-ink focus:outline-2 focus:outline-offset-1 focus:outline-primary"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />

        <label htmlFor="region" className="text-sm font-medium text-ink">
          Region
        </label>
        <select
          id="region"
          className="w-full rounded-md border border-line bg-surface p-2 text-sm text-ink focus:outline-2 focus:outline-offset-1 focus:outline-primary"
          value={region}
          onChange={(event) => setRegion(event.target.value)}
        >
          {REGIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <Button
          className="self-start"
          disabled={running || text.trim().length === 0}
          onClick={run}
        >
          {running ? "Classifying…" : "Classify"}
        </Button>
      </Card>

      {response && !response.ok && (
        <Card className="text-sm text-danger">
          {response.error ?? "Request failed."}
        </Card>
      )}

      {response?.ok && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">Verdict:</span>
            <Badge status={flagged ? "stalled" : "active"}>
              {flagged ? "flagged" : "not flagged"}
            </Badge>
            {response.signals?.map((signal) => (
              <Badge key={signal} status="neutral">
                {signal}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-ink-faint">
            Reference: <code>{response.reflectionId}</code> · Model:{" "}
            <code>{response.model}</code> ·{" "}
            {response.audited
              ? "audit row written (reference + timestamp only)"
              : "no audit row (unflagged)"}
          </p>
        </Card>
      )}

      {flagged && response?.resources && response.resources.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-faint">
            Support card (shown to the affected user only)
          </p>
          <SupportCard resources={response.resources} />
        </div>
      )}

      {response && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-primary">
            Raw response
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-surface-soft p-3 font-mono text-xs text-ink-soft">
            {JSON.stringify(response, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
