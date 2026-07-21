"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AgentThinking,
  Badge,
  Banner,
  Button,
  ButtonLink,
  Card,
  SectionLabel,
} from "@/components/ui";
import type { MatchResult } from "@/lib/matching";
import {
  PlanSwitchDialog,
  type PlanSwitchPrompt,
} from "../plan-switch-dialog";
import { StackedAvatars } from "../stacked-avatars";

/*
 * The match proposal screen (Step 21): a dedicated screen the "Find my circle"
 * action opens. Matching runs on mount; while it runs the shared AgentThinking
 * component carries matching-specific rotating lines. The result is one of
 * three designed states — a proposal to confirm, the founding-member
 * celebration when there was nothing to join, or an error banner that still
 * offers browse — so the screen never dead-ends.
 *
 * Confirming goes through the ordinary join route, which means the plan-switch
 * confirmation appears here exactly as it does when browsing.
 */

const THINKING_LINES = [
  "Reading your goals…",
  "Looking across open circles…",
  "Weighing what each circle is reading…",
  "Finding where you'd feel at home…",
];

export function MatchScreen() {
  const router = useRouter();
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [switchPrompt, setSwitchPrompt] = useState<PlanSwitchPrompt | null>(
    null,
  );
  // React runs effects twice in development Strict Mode; matching writes on the
  // zero-circles path, so the request must fire exactly once per mount.
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    fetch("/api/circles/match", { method: "POST" })
      .then((response) => response.json())
      .then((body) => {
        if (body.ok) setResult(body.result);
        else if (body.reason === "already_member") router.replace("/circles");
        else setError(body.error ?? "Round could not find you a circle.");
      })
      .catch(() => setError("Round could not find you a circle."));
  }, [router]);

  async function join(circleId: string, confirmPlanSwitch = false) {
    setJoining(true);
    setError(null);
    try {
      const response = await fetch(`/api/circles/${circleId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPlanSwitch }),
      });
      const body = await response.json();
      if (body.ok) {
        router.push(`/circles/${circleId}`);
        return;
      }
      if (body.reason === "plan_switch" && result?.kind === "match") {
        setSwitchPrompt({
          circleId,
          circleName: result.circle.name,
          planName: body.planName,
        });
      } else if (body.reason === "full") {
        setError(
          "That circle filled up while you were deciding. Browse the open circles to find another.",
        );
      } else {
        setError(body.error ?? "You could not join this circle.");
      }
    } catch {
      setError("You could not join this circle.");
    }
    setJoining(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionLabel icon={<Sparkles size={14} aria-hidden />}>
        Find my circle
      </SectionLabel>

      {error && <Banner tone="error">{error}</Banner>}

      {!result && !error && (
        <AgentThinking
          title="Finding your circle…"
          lines={THINKING_LINES}
          skeletonRows={4}
        />
      )}

      {result?.kind === "match" && (
        <>
          <MatchProposal
            result={result}
            joining={joining}
            onJoin={() => join(result.circle.id)}
          />
          {switchPrompt && (
            <PlanSwitchDialog
              prompt={switchPrompt}
              busy={joining}
              onConfirm={() => join(switchPrompt.circleId, true)}
              onCancel={() => {
                setSwitchPrompt(null);
                setJoining(false);
              }}
            />
          )}
        </>
      )}

      {result?.kind === "founded" && <FoundingMember result={result} />}

      {error && (
        <ButtonLink href="/circles" variant="secondary" full>
          Browse circles instead
        </ButtonLink>
      )}
    </div>
  );
}

/** The proposed circle: elevated card, plan badge, avatars, Gloo's words. */
function MatchProposal({
  result,
  joining,
  onJoin,
}: {
  result: Extract<MatchResult, { kind: "match" }>;
  joining: boolean;
  onJoin: () => void;
}) {
  const { circle, explanation } = result;
  return (
    <div className="flex flex-col gap-4">
      <Card variant="elevated" className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
            {circle.name}
          </h1>
          <Badge status={circle.state === "active" ? "active" : "forming"}>
            {circle.state}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge status="neutral">{circle.planName}</Badge>
        </div>

        <StackedAvatars names={circle.memberNames} count={circle.memberCount} />

        {/* Gloo's explanation, as a highlighted quote. */}
        <blockquote className="border-l-2 border-gold bg-gold-soft/40 px-3.5 py-3">
          <p className="font-serif text-base leading-relaxed text-ink">
            {explanation}
          </p>
          <footer className="mt-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
            Round
          </footer>
        </blockquote>

        <Button full onClick={onJoin} disabled={joining}>
          {joining ? "Joining…" : "Join this circle"}
        </Button>
      </Card>

      <ButtonLink href="/circles" variant="secondary" full>
        Browse circles instead
      </ButtonLink>
    </div>
  );
}

/** No circle existed, so the user founded one — warm, never an empty screen. */
function FoundingMember({
  result,
}: {
  result: Extract<MatchResult, { kind: "founded" }>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card variant="elevated" className="flex flex-col gap-3">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
          You&apos;re starting something new
        </h1>
        <hr className="w-12 border-t-2 border-gold" />
        <p className="text-sm leading-relaxed text-ink-soft">
          There was no open circle to join yet, so yours is now the first.{" "}
          <span className="font-medium text-ink">{result.circleName}</span> is
          reading {result.planName}, and it&apos;s waiting for one more reader
          to begin. Start reading today — the circle opens the moment someone
          joins you.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge status="forming">forming</Badge>
          <Badge status="neutral">{result.planName}</Badge>
        </div>
        <ButtonLink href={`/circles/${result.circleId}`} full>
          Open Circle
        </ButtonLink>
      </Card>

      <ButtonLink href="/plan" variant="secondary" full>
        See today&apos;s reading
      </ButtonLink>
    </div>
  );
}
