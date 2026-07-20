import { notFound } from "next/navigation";
import { devToolingEnabled } from "@/lib/dev-gate";
import { EscalationTester } from "./escalation-tester";

export const dynamic = "force-dynamic";

// Step 18: dev-only Escalation tester. Submit arbitrary text to verify the
// classifier, the reference-only audit write, and the private support card
// rendered with the correct region resources. 404s in production.
export default function EscalationTestPage() {
  if (!devToolingEnabled()) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
        Escalation Tester
      </h1>
      <p className="mb-6 mt-2 text-sm text-ink-soft">
        Dev-only. Submits text to the Escalation Agent via{" "}
        <code>POST /api/dev/escalation</code>. Benign text is not flagged;
        crisis-signal text is flagged, renders the private support card, and
        writes an <code>escalation_audit</code> row containing the reference and
        timestamp only — never the text.
      </p>
      <EscalationTester />
    </main>
  );
}
