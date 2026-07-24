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
import {
  PlanSwitchDialog,
  type PlanSwitchPrompt,
} from "./plan-switch-dialog";

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
  const [leaving, setLeaving] = useState(false);
  const [switchPrompt, setSwitchPrompt] = useState<PlanSwitchPrompt | null>(
    null,
  );

  /** Leave the current circle so another can be joined. The browse list then
   * shows every open circle — the public demo circle among them. */
  async function leave(circleId: string) {
    setLeaving(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/circles/${circleId}/leave`, {
        method: "POST",
      });
      const body = await response.json();
      if (body.ok) {
        await refresh();
      } else {
        setNotice(body.error ?? "Could not leave this circle.");
      }
    } catch {
      setNotice("Could not leave this circle.");
    } finally {
      setLeaving(false);
    }
  }

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

      {/* Hero: the user's own circle, once joined. Leaving frees the reader to
          join another circle from the browse list below (the public demo circle
          among them). */}
      {circle && (
        <CircleHero
          circle={circle}
          leaving={leaving}
          onLeave={() => void leave(circle.id)}
        />
      )}

      {/* The three ways in (Step 21 adds matching): let Round match you — the
          screen's one primary action — start your own, or browse below. */}
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
          <div className="flex flex-col gap-2.5">
            <ButtonLink href="/circles/match" full>
              Find my circle
            </ButtonLink>
            <p className="px-1 text-center text-sm text-ink-faint">
              Round reads your goals and suggests the circle that fits you best.
            </p>
            <Button variant="secondary" full onClick={() => setCreating(true)}>
              Start a circle
            </Button>
          </div>
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
function CircleHero({
  circle,
  leaving,
  onLeave,
}: {
  circle: UserCircle;
  leaving: boolean;
  onLeave: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
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

      {/* Leave — behind a confirm, since it drops the reader from the circle
          (they can then join another from the browse list below). */}
      {confirming ? (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-3">
          <p className="text-sm text-ink-soft">
            Leave {circle.name}? You can join another circle afterwards.
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              full
              disabled={leaving}
              onClick={onLeave}
            >
              {leaving ? "Leaving…" : "Leave circle"}
            </Button>
            <Button
              variant="secondary"
              full
              disabled={leaving}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-center text-sm font-medium text-ink-faint underline-offset-4 transition-colors hover:text-ink-soft hover:underline"
        >
          Leave circle
        </button>
      )}
    </Card>
  );
}
