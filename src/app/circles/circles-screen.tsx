"use client";

import { Users } from "lucide-react";
import { useState } from "react";
import {
  Avatar,
  Badge,
  Banner,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  SectionLabel,
} from "@/components/ui";
import type { CircleBrowseItem, UserCircle } from "@/lib/circles";
import { CircleBrowseCard } from "./circle-browse-card";
import { CreateCircle } from "./create-circle";

/*
 * The /circles tab (Step 16), composed in the 8C register: "CIRCLES" icon-chip
 * label, serif headings, the user's own circle as the hero card (once joined)
 * with browse results as flat cards beneath — a sibling of Home. Path A only;
 * anonymous sessions get the sign-in state (Path B joins the demo circle in
 * Step 30).
 */
export function CirclesScreen({
  initialCircle,
  initialOpen,
}: {
  initialCircle: UserCircle | null;
  initialOpen: CircleBrowseItem[];
}) {
  const [circle, setCircle] = useState(initialCircle);
  const [open, setOpen] = useState(initialOpen);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [switchPrompt, setSwitchPrompt] = useState<{
    circleId: string;
    circleName: string;
    planName: string;
  } | null>(null);

  async function refresh() {
    const response = await fetch("/api/circles");
    const body = await response.json();
    if (body.ok) {
      setCircle(body.circle);
      setOpen(body.open);
    }
  }

  async function join(circleId: string, confirmPlanSwitch = false) {
    setBusyId(circleId);
    setNotice(null);
    try {
      const response = await fetch(`/api/circles/${circleId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPlanSwitch }),
      });
      const body = await response.json();
      if (body.ok) {
        setSwitchPrompt(null);
        await refresh();
      } else if (body.reason === "plan_switch") {
        const target = open.find((item) => item.id === circleId);
        setSwitchPrompt({
          circleId,
          circleName: target?.name ?? "this circle",
          planName: body.planName,
        });
      } else if (body.reason === "full") {
        setSwitchPrompt(null);
        const target = open.find((item) => item.id === circleId);
        setNotice(
          `${target?.name ?? "That circle"} is full — it already has five readers. Try another, or start your own.`,
        );
        await refresh();
      } else {
        setNotice(body.error ?? "You could not join this circle.");
      }
    } catch {
      setNotice("You could not join this circle.");
    } finally {
      setBusyId(null);
    }
  }

  const inACircle = circle !== null;

  return (
    <div className="flex flex-col gap-6">
      <SectionLabel icon={<Users size={14} aria-hidden />}>Circles</SectionLabel>

      {notice && <Banner tone="warning">{notice}</Banner>}

      {/* Hero: the user's own circle, once joined. */}
      {circle && <CircleHero circle={circle} />}

      {/* Create flow — offered only when the user is not already in a circle. */}
      {!inACircle &&
        (creating ? (
          <CreateCircle
            onCreated={() => {
              setCreating(false);
              void refresh();
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <Button full onClick={() => setCreating(true)}>
            Start a circle
          </Button>
        ))}

      {/* Browse: open circles. */}
      <div className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
          {inACircle ? "Other open circles" : "Open circles"}
        </h2>
        {open.length === 0 ? (
          <EmptyState
            icon="◎"
            heading={inACircle ? "No other open circles" : "No open circles yet"}
            subtext={
              inACircle
                ? "You're all set with your circle above."
                : "Be the first — start one and invite others to read along."
            }
            cta={
              inACircle || creating ? undefined : (
                <Button onClick={() => setCreating(true)}>Start a circle</Button>
              )
            }
          />
        ) : (
          open.map((item) => (
            <CircleBrowseCard
              key={item.id}
              circle={item}
              joinable={!inACircle}
              busy={busyId === item.id}
              onJoin={() => join(item.id)}
            />
          ))
        )}
      </div>

      {/* Plan-switch confirmation — never a silent swap. */}
      {switchPrompt && (
        <PlanSwitchDialog
          prompt={switchPrompt}
          busy={busyId === switchPrompt.circleId}
          onConfirm={() => join(switchPrompt.circleId, true)}
          onCancel={() => setSwitchPrompt(null)}
        />
      )}
    </div>
  );
}

/** The user's own circle as the screen's hero — roster shows names only. */
function CircleHero({ circle }: { circle: UserCircle }) {
  return (
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
      <hr className="w-12 border-t-2 border-gold" />
      <p className="text-sm text-ink-soft">
        {circle.state === "forming"
          ? "Waiting for one more reader to begin."
          : "You're reading together."}
      </p>
      <ul className="flex flex-col gap-2">
        {circle.memberNames.map((name, index) => (
          <li key={`${name}-${index}`} className="flex items-center gap-2.5">
            <Avatar name={name} size="sm" />
            <span className="text-sm font-medium text-ink">{name}</span>
          </li>
        ))}
      </ul>
      <ButtonLink href={`/circles/${circle.id}`} full>
        Open Circle
      </ButtonLink>
    </Card>
  );
}

/** Explicit "switch your reading?" confirmation before an aligning join. */
function PlanSwitchDialog({
  prompt,
  busy,
  onConfirm,
  onCancel,
}: {
  prompt: { circleName: string; planName: string };
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 animate-sheet-fade bg-ink/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Switch your reading?"
        className="relative flex w-full max-w-lg animate-sheet-up flex-col gap-4 rounded-t-xl bg-surface px-4 py-5 shadow-card"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
          Switch your reading?
        </h2>
        <p className="text-sm text-ink-soft">
          {prompt.circleName} reads {prompt.planName}. Joining makes it your
          active plan; your current plan pauses and keeps its progress — you can
          resume it any time from My Plan.
        </p>
        <div className="flex gap-3">
          <Button full onClick={onConfirm} disabled={busy}>
            {busy ? "Joining…" : `Switch and join`}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
