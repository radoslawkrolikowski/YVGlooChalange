"use client";

// Step 30A: dev-console control that deletes anonymous-session data on demand
// (POST /api/admin/prune-anon). It proves the session-scoping claim — every
// anonymous artifact is reachable by one key and removable in one pass — before
// Step 31 puts the same helper on the daily cron rail. Seeded bot and human
// member content is owned by user rows and is never touched.

import { useState } from "react";
import { Badge, Banner, Button, Card } from "@/components/ui";
import type { AnonPruneCounts } from "@/lib/anon-prune";

interface PruneState {
  running: boolean;
  result?: { counts: AnonPruneCounts; total: number };
  error?: string;
}

const LABELS: Record<keyof AnonPruneCounts, string> = {
  reflections: "reflections",
  messages: "messages",
  highlights: "highlights",
  savedPrayers: "saved prayers",
  notifications: "notifications",
};

export function AnonPruneControl() {
  const [state, setState] = useState<PruneState>({ running: false });

  async function prune() {
    setState({ running: true });
    try {
      const response = await fetch("/api/admin/prune-anon", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok: boolean;
        counts?: AnonPruneCounts;
        total?: number;
        error?: string;
      };
      if (payload.ok && payload.counts) {
        setState({
          running: false,
          result: { counts: payload.counts, total: payload.total ?? 0 },
        });
      } else {
        setState({
          running: false,
          error: payload.error ?? `HTTP ${response.status}`,
        });
      }
    } catch (error) {
      setState({
        running: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
          Anonymous session data
        </h2>
        <Badge status="neutral">Step 30A</Badge>
      </div>
      <p className="text-sm text-ink-soft">
        Deletes every row tagged with an anonymous session id — reflections,
        thread messages, in-app highlights, saved prayers, and notifications.
        Seeded bot and member content is owned by user rows and survives. This
        button prunes with a cutoff of <em>now</em>, so it removes even a
        reflection just submitted; the Step 31 demo-refresh sweep runs the same
        helper daily with a cutoff of the <em>previous refresh</em>, so nothing
        is ever deleted out from under a visitor who is mid-session.
      </p>
      <Button className="self-start" disabled={state.running} onClick={prune}>
        {state.running ? "Pruning…" : "Prune anonymous data"}
      </Button>
      {state.error && <Banner tone="error">{state.error}</Banner>}
      {state.result && (
        <Banner tone={state.result.total > 0 ? "success" : "info"}>
          {state.result.total > 0
            ? `Pruned ${state.result.total} rows — ${(
                Object.keys(LABELS) as (keyof AnonPruneCounts)[]
              )
                .filter((key) => state.result!.counts[key] > 0)
                .map((key) => `${state.result!.counts[key]} ${LABELS[key]}`)
                .join(", ")}.`
            : "Nothing to prune — no anonymous rows are stored."}
        </Banner>
      )}
    </Card>
  );
}
