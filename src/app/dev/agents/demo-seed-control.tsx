"use client";

// Step 30: dev-console control to seed the public demo circle. Calls the
// secured admin route (POST /api/admin/seed-demo), which is authorized in
// non-production without the CRON_SECRET. Idempotent — re-clicking reports the
// circle already exists rather than seeding twice.

import { useState } from "react";
import { Badge, Banner, Button, Card } from "@/components/ui";

interface SeedState {
  running: boolean;
  result?: { seeded: boolean; circleId: string; detail: string };
  error?: string;
}

export function DemoSeedControl() {
  const [state, setState] = useState<SeedState>({ running: false });

  async function seed() {
    setState({ running: true });
    try {
      const response = await fetch("/api/admin/seed-demo", { method: "POST" });
      const payload = (await response.json()) as {
        ok: boolean;
        seeded?: boolean;
        circleId?: string;
        detail?: string;
        error?: string;
      };
      if (payload.ok && payload.circleId) {
        setState({
          running: false,
          result: {
            seeded: Boolean(payload.seeded),
            circleId: payload.circleId,
            detail: payload.detail ?? "",
          },
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
          Public demo circle
        </h2>
        <Badge status="neutral">Step 30</Badge>
      </div>
      <p className="text-sm text-ink-soft">
        Provisions the public circle, its AI bot member, a demo persona, and the
        opening thread (hello, two reflections, starters, and a digest) via real
        Gloo calls. Idempotent. In production, run once with the CRON_SECRET
        bearer against <code>POST /api/admin/seed-demo</code>.
      </p>
      <Button className="self-start" disabled={state.running} onClick={seed}>
        {state.running ? "Seeding…" : "Seed demo circle"}
      </Button>
      {state.error && <Banner tone="error">{state.error}</Banner>}
      {state.result && (
        <Banner tone={state.result.seeded ? "success" : "info"}>
          {state.result.seeded
            ? `Seeded — ${state.result.detail} (circle ${state.result.circleId})`
            : `Already seeded (circle ${state.result.circleId})`}
        </Banner>
      )}
    </Card>
  );
}
