import { notFound } from "next/navigation";
import { agents } from "@/agents";
import { devToolingEnabled } from "@/lib/dev-gate";
import { AgentConsole, type ConsoleAgent } from "./agent-console";

export const dynamic = "force-dynamic";

// Step 5: dev-only Agent Console. Lists all 13 agents with a trigger button
// each; in Step 23 this page also gains buttons for the secured cron routes,
// making it the local stand-in for Vercel Cron. 404s in production.
export default function AgentConsolePage() {
  if (!devToolingEnabled()) {
    notFound();
  }

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
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Agent Console</h1>
      <p>
        Dev-only. Triggers call each agent&apos;s <code>run()</code> through{" "}
        <code>POST /api/dev/agents/[name]</code>. Shells make a live Gloo call;
        stubs return &quot;not implemented&quot;. Every run writes an{" "}
        <code>agent_logs</code> row.
      </p>
      <AgentConsole agents={consoleAgents} />
    </main>
  );
}
