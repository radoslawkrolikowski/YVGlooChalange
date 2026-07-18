"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner, Button, Card, Skeleton } from "@/components/ui";
import { Wordmark } from "@/components/layout/wordmark";

/*
 * Highlight import consent screen (designed in Step 8A, wired in Step 7):
 * plain explanation of what is imported and why, equal-weight Allow and Skip
 * actions, no dark patterns. Allow calls the User Highlights API and stores
 * the result; Skip records the decline and changes nothing else.
 */

type Phase =
  | { name: "idle" }
  | { name: "importing" }
  | { name: "skipping" }
  | { name: "done"; count: number }
  | { name: "error"; message: string };

export function ConsentScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });

  const busy =
    phase.name === "importing" || phase.name === "skipping";

  async function allow() {
    setPhase({ name: "importing" });
    try {
      const response = await fetch("/api/highlights/import", {
        method: "POST",
      });
      const body = (await response.json()) as {
        ok: boolean;
        count?: number;
        error?: string;
      };
      if (!body.ok) {
        setPhase({
          name: "error",
          message: body.error ?? "Importing highlights failed.",
        });
        return;
      }
      setPhase({ name: "done", count: body.count ?? 0 });
    } catch {
      setPhase({
        name: "error",
        message: "Importing highlights failed. Please try again.",
      });
    }
  }

  async function skip() {
    setPhase({ name: "skipping" });
    try {
      const response = await fetch("/api/highlights/decline", {
        method: "POST",
      });
      if (!response.ok) throw new Error();
      router.push("/home");
    } catch {
      setPhase({
        name: "error",
        message: "Saving your choice failed. Please try again.",
      });
    }
  }

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

      {phase.name === "importing" && (
        <Card className="flex flex-col gap-3" aria-live="polite">
          <p className="text-sm font-medium text-ink">
            Importing your highlights…
          </p>
          <Skeleton variant="text" className="w-3/4" />
          <Skeleton variant="text" className="w-2/3" />
          <Skeleton variant="text" className="w-4/5" />
        </Card>
      )}

      <div className="mt-auto flex flex-col gap-3 pb-4">
        {phase.name === "error" && <Banner tone="error">{phase.message}</Banner>}

        {phase.name === "done" ? (
          <>
            <Banner tone="success">
              {phase.count === 0
                ? "All set — no highlights were found in your YouVersion account yet."
                : `${phase.count} highlight${phase.count === 1 ? "" : "s"} imported. You can review or delete them from your profile at any time.`}
            </Banner>
            <Button full onClick={() => router.push("/home")}>
              Continue
            </Button>
          </>
        ) : (
          <>
            <Button full onClick={allow} disabled={busy}>
              {phase.name === "importing"
                ? "Importing…"
                : "Allow highlight import"}
            </Button>
            <Button variant="secondary" full onClick={skip} disabled={busy}>
              {phase.name === "skipping" ? "One moment…" : "Skip for now"}
            </Button>
            <p className="text-center text-xs text-ink-faint">
              Skipping changes nothing else — every feature keeps working.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
