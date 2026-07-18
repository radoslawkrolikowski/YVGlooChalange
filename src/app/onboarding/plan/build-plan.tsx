"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import { PlanDayList } from "@/components/plan/plan-day-list";
import { selectPlan } from "@/components/plan/plan-picker";
import {
  AgentThinking,
  Badge,
  Banner,
  Button,
  Card,
  ChoiceChips,
  EmptyState,
  MultiChoiceChips,
  SectionLabel,
  TextArea,
} from "@/components/ui";
import {
  DEFAULT_PLAN_DURATION_DAYS,
  PLAN_DURATION_OPTIONS,
} from "@/config/plan-durations";
import {
  optionLabel,
  type ProfileAnswers,
  TIME_PER_DAY_OPTIONS,
  TOPIC_OPTIONS,
} from "@/config/profile";

/*
 * "Create my own plan" flow (Step 12) — the recommended default at the end
 * of onboarding. The form arrives pre-filled from the Step 10 profile
 * answers plus the per-plan duration question; "Build my plan" streams the
 * PlanBuilder run, showing the AgentThinking state with rotating lines
 * personalised from the user's own goals, then REAL validation progress
 * driven by the server's per-reference loop. The preview reuses Step 11's
 * day list with fallback-substituted days marked "adjusted"; wholesale
 * failure offers the pre-defined library instead — never a dead end.
 */

interface PreviewDay {
  dayNumber: number;
  reference: string;
  label: string;
  adjusted: boolean;
}

interface PlanPreview {
  planId: string;
  name: string;
  description: string;
  lengthDays: number;
  days: PreviewDay[];
}

type Phase =
  | { kind: "form" }
  | { kind: "thinking"; progress: string | null }
  | { kind: "preview"; plan: PlanPreview }
  | { kind: "failed"; message: string };

function thinkingLines(goals: string, topics: string[]): string[] {
  const lines = ["Reading your goals…"];
  const goalSnippet = goals.trim();
  if (goalSnippet) {
    lines.push(
      `Shaping days around "${goalSnippet.slice(0, 60)}${goalSnippet.length > 60 ? "…" : ""}"…`,
    );
  }
  for (const topic of topics.slice(0, 2)) {
    const label = optionLabel(TOPIC_OPTIONS, topic);
    if (label) lines.push(`Finding passages on ${label.toLowerCase()}…`);
  }
  lines.push("Balancing each day to fit your time…");
  return lines;
}

function progressText(event: Record<string, unknown>): string | null {
  if (event.type === "validating") {
    return `Checking day ${event.day} of ${event.total}…`;
  }
  if (event.type === "regenerating") {
    return `Rethinking day ${event.day} of ${event.total}…`;
  }
  return null; // "generating" keeps the rotating lines
}

export function BuildPlan({ initialAnswers }: { initialAnswers: ProfileAnswers }) {
  const router = useRouter();
  const [goals, setGoals] = useState(initialAnswers.goals);
  const [timePerDay, setTimePerDay] = useState<number>(
    initialAnswers.timePerDayMinutes ?? 10,
  );
  const [topics, setTopics] = useState<string[]>(initialAnswers.topics);
  const [durationDays, setDurationDays] = useState(DEFAULT_PLAN_DURATION_DAYS);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function build() {
    setPhase({ kind: "thinking", progress: null });
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
      if (token) headers["x-round-session"] = token;

      const response = await fetch("/api/plans/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ goals, timePerDayMinutes: timePerDay, topics, durationDays }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Plan generation failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.type === "done") {
            setPhase({ kind: "preview", plan: event.plan as PlanPreview });
            finished = true;
          } else if (event.type === "failed") {
            setPhase({
              kind: "failed",
              message: typeof event.error === "string" ? event.error : "",
            });
            finished = true;
          } else {
            const progress = progressText(event);
            setPhase({ kind: "thinking", progress });
          }
        }
      }
      if (!finished) {
        throw new Error("The connection dropped before your plan finished");
      }
    } catch {
      setPhase({
        kind: "failed",
        message: "We couldn't build your plan this time.",
      });
    }
  }

  async function start(planId: string) {
    setStarting(true);
    setStartError(null);
    try {
      await selectPlan(planId);
      router.push("/home");
    } catch (caught) {
      setStartError(
        caught instanceof Error ? caught.message : "Something went wrong",
      );
      setStarting(false);
    }
  }

  if (phase.kind === "thinking") {
    return (
      <Card variant="elevated" className="flex flex-col gap-4">
        <SectionLabel icon={<Sparkles size={14} aria-hidden />}>
          Your plan
        </SectionLabel>
        <AgentThinking
          title="Building your plan…"
          lines={thinkingLines(goals, topics)}
          progress={phase.progress}
          skeletonRows={Math.min(durationDays, 8)}
        />
      </Card>
    );
  }

  if (phase.kind === "preview") {
    const { plan } = phase;
    const adjustedCount = plan.days.filter((day) => day.adjusted).length;
    return (
      <div className="flex flex-col gap-4">
        <Card variant="elevated" className="flex flex-col gap-4">
          <SectionLabel icon={<Sparkles size={14} aria-hidden />}>
            Your plan
          </SectionLabel>
          <div className="flex flex-col gap-1">
            <h2 className="font-serif text-xl font-semibold tracking-tight text-ink">
              {plan.name}
            </h2>
            <p className="text-sm text-ink-soft">
              {plan.lengthDays} days · {plan.description}
            </p>
          </div>
          {adjustedCount > 0 && (
            <p className="text-sm text-ink-soft">
              {adjustedCount === 1 ? "One day was" : `${adjustedCount} days were`}{" "}
              adjusted with a hand-picked passage so every reading opens
              correctly.
            </p>
          )}
          <PlanDayList
            days={plan.days}
            trailing={(day) =>
              plan.days.find((d) => d.dayNumber === day.dayNumber)?.adjusted ? (
                <Badge status="forming">Adjusted</Badge>
              ) : null
            }
          />
          {startError && <Banner tone="error">{startError}</Banner>}
          <Button full onClick={() => start(plan.planId)} disabled={starting}>
            {starting ? "Starting…" : "Start this plan"}
          </Button>
        </Card>
        <Button
          variant="ghost"
          full
          onClick={() => setPhase({ kind: "form" })}
          disabled={starting}
        >
          Adjust my answers and rebuild
        </Button>
      </div>
    );
  }

  if (phase.kind === "failed") {
    return (
      <Card variant="elevated">
        <EmptyState
          icon="🌱"
          heading="We couldn't build your plan"
          subtext="Our plan builder hit a snag. You can try again, or start with one of our ready-made plans — they're lovely too."
          cta={
            <div className="flex flex-col items-center gap-2">
              <Button onClick={() => setPhase({ kind: "form" })}>
                Try again
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push("/onboarding/plan/library")}
              >
                Browse ready-made plans
              </Button>
            </div>
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card variant="elevated" className="flex flex-col gap-5">
        <SectionLabel icon={<Sparkles size={14} aria-hidden />}>
          Your plan
        </SectionLabel>
        <TextArea
          label="What should your plan help you with?"
          helper="Pre-filled from your answers — adjust it freely."
          placeholder="e.g. Learning to forgive people who hurt me"
          value={goals}
          maxLength={500}
          onChange={(event) => setGoals(event.target.value)}
        />
        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-medium text-ink">Time per day</p>
          <ChoiceChips
            label="Time per day"
            options={TIME_PER_DAY_OPTIONS.map((minutes) => ({
              value: minutes,
              label: `${minutes} minutes`,
            }))}
            value={timePerDay}
            onChange={setTimePerDay}
          />
        </div>
        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-medium text-ink">Topics to weave in</p>
          <MultiChoiceChips
            label="Topics to weave in"
            options={TOPIC_OPTIONS}
            values={topics}
            onChange={setTopics}
          />
        </div>
        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-medium text-ink">How long a plan?</p>
          <ChoiceChips
            label="How long a plan?"
            options={PLAN_DURATION_OPTIONS.map((option) => ({
              value: option.days,
              label: option.label,
            }))}
            value={durationDays}
            onChange={setDurationDays}
          />
        </div>
        <Button full onClick={build}>
          Build my plan
        </Button>
      </Card>
      <p className="text-center text-sm text-ink-soft">
        Rather not?{" "}
        <Link
          href="/onboarding/plan/library"
          className="font-medium text-primary underline underline-offset-2"
        >
          Browse ready-made plans instead
        </Link>
      </p>
    </div>
  );
}
