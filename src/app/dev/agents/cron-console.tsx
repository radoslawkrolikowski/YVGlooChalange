"use client";

// Step 23: cron cards on the Agent Console — the local stand-in for Vercel
// Cron. Each card triggers its secured route through the dev proxy
// (/api/dev/cron/[job]), which invokes the exact production handler with the
// real bearer secret; results render as styled sweep summaries, never raw
// JSON dumps.

import { useState } from "react";
import { Badge, Banner, Button, Card } from "@/components/ui";
import type { SweepResult } from "@/lib/cron-sweeps";

export interface ConsoleCronJob {
  /** Route segment: /api/cron/[job]. */
  job: string;
  displayName: string;
  description: string;
  /** Human-readable production schedule, e.g. "Daily 05:00 UTC". */
  schedule: string;
  /** ISO timestamp of the most recent agent_runs claim, null if never ran. */
  lastRunAt: string | null;
}

interface RunState {
  running: boolean;
  results?: SweepResult[];
  error?: string;
}

function formatRunTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function SweepBlock({ sweep }: { sweep: SweepResult }) {
  return (
    <div className="rounded-md bg-surface-soft p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink">{sweep.job}</span>
        <Badge status="neutral">{sweep.periodKey}</Badge>
        <span className="text-xs text-ink-soft">
          {sweep.targets.length} eligible — {sweep.ran} ran,{" "}
          {sweep.alreadyRan} already ran
        </span>
      </div>
      {sweep.note && (
        <p className="mt-1 text-xs italic text-ink-soft">{sweep.note}</p>
      )}
      {sweep.targets.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {sweep.targets.map((target) => (
            <li
              key={target.targetId}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="truncate font-mono text-ink-soft">
                {target.targetId}
              </span>
              <Badge status={target.status === "ran" ? "active" : "neutral"}>
                {target.status === "ran" ? "ran" : "already ran"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CronConsole({ jobs }: { jobs: ConsoleCronJob[] }) {
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [lastRuns, setLastRuns] = useState<Record<string, string | null>>(
    Object.fromEntries(jobs.map((job) => [job.job, job.lastRunAt])),
  );

  async function trigger(job: ConsoleCronJob) {
    setRuns((previous) => ({ ...previous, [job.job]: { running: true } }));
    try {
      const response = await fetch(`/api/dev/cron/${job.job}`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok: boolean;
        results?: SweepResult[];
        error?: string;
      };
      if (payload.ok && payload.results) {
        setRuns((previous) => ({
          ...previous,
          [job.job]: { running: false, results: payload.results },
        }));
        if (payload.results.some((sweep) => sweep.ran > 0)) {
          setLastRuns((previous) => ({
            ...previous,
            [job.job]: new Date().toISOString(),
          }));
        }
      } else {
        setRuns((previous) => ({
          ...previous,
          [job.job]: {
            running: false,
            error: payload.error ?? `HTTP ${response.status}`,
          },
        }));
      }
    } catch (error) {
      setRuns((previous) => ({
        ...previous,
        [job.job]: {
          running: false,
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {jobs.map((job) => {
        const run = runs[job.job];
        const lastRunAt = lastRuns[job.job];
        return (
          <Card key={job.job} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
                {job.displayName}
              </h2>
              <Badge status="neutral">{job.schedule}</Badge>
              <Badge status={lastRunAt ? "active" : "neutral"}>
                {lastRunAt
                  ? `last run ${formatRunTime(lastRunAt)}`
                  : "never ran"}
              </Badge>
            </div>
            <p className="text-sm text-ink-soft">{job.description}</p>
            <Button
              className="self-start"
              disabled={run?.running}
              onClick={() => trigger(job)}
            >
              {run?.running ? "Running…" : "Trigger"}
            </Button>
            {run?.error && <Banner tone="error">{run.error}</Banner>}
            {run?.results && (
              <div className="flex flex-col gap-2">
                {run.results.map((sweep) => (
                  <SweepBlock key={`${sweep.job}-${sweep.periodKey}`} sweep={sweep} />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
