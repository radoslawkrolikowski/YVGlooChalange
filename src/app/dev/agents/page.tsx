import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { agents } from "@/agents";
import { db } from "@/db";
import { agentRuns } from "@/db/schema";
import { devToolingEnabled } from "@/lib/dev-gate";
import { AgentConsole, type ConsoleAgent } from "./agent-console";
import { CronConsole, type ConsoleCronJob } from "./cron-console";

export const dynamic = "force-dynamic";

// The cron cards (Step 23) — the local stand-in for Vercel Cron. `names`
// lists which agent_runs.agent_name values feed the card's last-run badge
// (the daily dispatcher writes no rows of its own; its constituents do).
const cronJobs: {
  job: string;
  displayName: string;
  description: string;
  schedule: string;
  names: string[];
}[] = [
  {
    job: "daily",
    displayName: "Daily sweep (production cron)",
    description:
      "The combined route Vercel Cron calls in production: Facilitator+Summary per circle, Reminder per user, and the demo refresh — consolidated because the Hobby plan allows two daily crons.",
    schedule: "daily 05:00 UTC",
    names: ["facilitator", "reminder", "demo-refresh"],
  },
  {
    job: "facilitator",
    displayName: "Facilitator + Summary sweep",
    description:
      "Daily, per circle. Claims one agent_runs row per active circle; Step 24 adds digest generation behind each claim.",
    schedule: "daily · via daily sweep",
    names: ["facilitator"],
  },
  {
    job: "reminder",
    displayName: "Reminder sweep",
    description:
      "Daily, per user with an active reading plan. Claims one agent_runs row per user; Step 29 adds reminder generation and delivery.",
    schedule: "daily · via daily sweep",
    names: ["reminder"],
  },
  {
    job: "health",
    displayName: "Health sweep",
    description:
      "12-hourly per active circle by design (am/pm period keys); the Hobby plan fires the am half once a day. Stub until Step 34.",
    schedule: "daily 06:00 UTC",
    names: ["health"],
  },
  {
    job: "demo-refresh",
    displayName: "Demo refresh",
    description:
      "Daily. Inactive until Step 31 lands the demo circle — the secured route and cron slot already exist.",
    schedule: "daily · via daily sweep",
    names: ["demo-refresh"],
  },
];

// Step 5: dev-only Agent Console; Step 23 added the cron cards above, making
// this page the local stand-in for Vercel Cron. 404s in production.
export default async function AgentConsolePage() {
  if (!devToolingEnabled()) {
    notFound();
  }

  // Last-run badge per cron card: the newest agent_runs claim among the
  // card's agent names. One small query per name — dev-only page.
  const consoleCronJobs: ConsoleCronJob[] = await Promise.all(
    cronJobs.map(async ({ names, ...job }) => {
      let lastRunAt: string | null = null;
      for (const name of names) {
        const [latest] = await db
          .select({ createdAt: agentRuns.createdAt })
          .from(agentRuns)
          .where(eq(agentRuns.agentName, name))
          .orderBy(desc(agentRuns.createdAt))
          .limit(1);
        if (
          latest &&
          (!lastRunAt || latest.createdAt.toISOString() > lastRunAt)
        ) {
          lastRunAt = latest.createdAt.toISOString();
        }
      }
      return { ...job, lastRunAt };
    }),
  );

  // Only serialisable fields cross to the client component — run() stays
  // server-side behind the trigger API route.
  const consoleAgents: ConsoleAgent[] = agents.map((agent) => ({
    name: agent.name,
    displayName: agent.displayName,
    description: agent.description,
    tier: agent.tier,
    implementation: agent.implementation,
    sampleInput: JSON.stringify(agent.sampleInput, null, 2),
  }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
        Agent Console
      </h1>
      <p className="mb-6 mt-2 text-sm text-ink-soft">
        Dev-only. Cron cards trigger the secured scheduled routes through{" "}
        <code>POST /api/dev/cron/[job]</code> — the identical handlers Vercel
        Cron calls in production, bearer auth included. Agent cards call each
        agent&apos;s <code>run()</code> through{" "}
        <code>POST /api/dev/agents/[name]</code>.
      </p>
      <h2 className="mb-3 font-serif text-xl font-semibold tracking-tight text-ink">
        Scheduled sweeps
      </h2>
      <CronConsole jobs={consoleCronJobs} />
      <h2 className="mb-3 mt-8 font-serif text-xl font-semibold tracking-tight text-ink">
        Agents
      </h2>
      <AgentConsole agents={consoleAgents} />
    </main>
  );
}
