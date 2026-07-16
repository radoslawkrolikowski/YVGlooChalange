"use client";

import { useRouter } from "next/navigation";
import { Banner, Button, Card } from "@/components/ui";
import { Wordmark } from "@/components/layout/wordmark";

/*
 * Highlight import consent screen (Step 8A). Production UI for Step 7's
 * opt-in flow: plain explanation of what is imported and why, equal-weight
 * Allow and Skip actions, no dark patterns. The real import wiring arrives
 * with Steps 6/7 — until then both actions return to the home screen.
 */
export default function ConsentPage() {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-10">
      <Wordmark />

      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
          Import your highlights?
        </h1>
        <p className="text-base text-ink-soft">
          Round can personalise your reading prompts using highlights you have
          already made in the YouVersion Bible App.
        </p>
      </div>

      <Card className="flex flex-col gap-3 text-sm text-ink-soft">
        <div>
          <h2 className="mb-1 font-semibold text-ink">What we import</h2>
          <p>
            Your existing highlights: the verse reference, the Bible version it
            was made in, a short text snippet, and the date.
          </p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-ink">Why we ask</h2>
          <p>
            Highlights help Round suggest reading prompts connected to verses
            that already matter to you.
          </p>
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-ink">What we never do</h2>
          <p>
            Your highlights are never shared with your circle unless you
            explicitly share one yourself. You can delete all imported
            highlights from your profile at any time.
          </p>
        </div>
      </Card>

      <div className="mt-auto flex flex-col gap-3 pb-4">
        <Banner tone="info">
          Highlight import arrives with YouVersion sign-in (Steps 6–7). This
          screen previews the consent step.
        </Banner>
        <Button full onClick={() => router.push("/home")}>
          Allow highlight import
        </Button>
        <Button variant="secondary" full onClick={() => router.push("/home")}>
          Skip for now
        </Button>
        <p className="text-center text-xs text-ink-faint">
          Skipping changes nothing else — every feature keeps working.
        </p>
      </div>
    </main>
  );
}
