"use client";

import { ArrowRight, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import {
  Banner,
  Card,
  EmptyState,
  RoundAvatar,
  SectionLabel,
  SkeletonText,
} from "@/components/ui";
import { useAnonSession } from "@/lib/use-anon-session";
import { UpgradeBanner } from "../home/upgrade-banner";
import { PlanSwitchDialog } from "./plan-switch-dialog";

/*
 * Path B /circles tab (Step 16; Steps 30 and 30A). An Instant Access visitor
 * has no user row, so creating and joining a matched circle still need a
 * YouVersion account — but the PUBLIC demo circle ("Public Round Circle —
 * Psalms") is open to anyone in one tap (Step 30). This screen leads with that:
 * read, reflect, and converse with a live AI member and other visitors, no
 * sign-up. Signing in is offered as the way to a private matched circle, never
 * as a gate to the demo.
 *
 * Joining is real membership, not navigation (Step 30A): it records the circle
 * in the signed token and takes on the circle's reading plan, so /plan, /read
 * and Home show the circle's passage. The card therefore knows whether this
 * session has already joined and says "Open circle" instead of asking again. A
 * visitor who had picked their own plan gets the same explicit switch prompt a
 * member does — never a silent swap.
 */

interface PublicCircle {
  id: string;
  name: string;
}

export function AnonCircles() {
  const session = useAnonSession();
  const router = useRouter();
  const [publicCircle, setPublicCircle] = useState<PublicCircle | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [joining, setJoining] = useState(false);
  const [planSwitch, setPlanSwitch] = useState<{ planName: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/circles/public")
      .then((response) => response.json())
      .then((body) => {
        if (body.ok && body.circle) setPublicCircle(body.circle as PublicCircle);
      })
      .catch(() => {
        // Leave publicCircle null — the graceful "not available" state shows.
      })
      .finally(() => setLoaded(true));
  }, []);

  const joined = Boolean(
    session && publicCircle && session.circleId === publicCircle.id,
  );

  async function join(confirmPlanSwitch = false) {
    if (!publicCircle) return;
    setJoining(true);
    setError(null);
    try {
      const token = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
      const response = await fetch(`/api/circles/${publicCircle.id}/join`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { "x-round-session": token } : {}),
        },
        body: JSON.stringify({ confirmPlanSwitch }),
      });
      const body = await response.json();
      if (body.reason === "plan_switch") {
        setPlanSwitch({ planName: body.planName as string });
        return;
      }
      if (!body.ok) {
        setError(body.error ?? "Could not join the circle. Please try again.");
        return;
      }
      if (body.token) {
        sessionStorage.setItem(ANON_TOKEN_STORAGE_KEY, body.token);
      }
      router.push(`/circles/${publicCircle.id}`);
    } catch {
      setError("Could not join the circle. Please try again.");
    } finally {
      setJoining(false);
      setPlanSwitch(null);
    }
  }

  if (!session) {
    return (
      <AppShell banner={<UpgradeBanner />}>
        <SkeletonText lines={4} />
      </AppShell>
    );
  }

  return (
    <AppShell
      banner={<UpgradeBanner />}
      headerAction={<HeaderMenu displayName={session.displayName} isAnonymous />}
    >
      <div className="flex flex-col gap-6">
        <SectionLabel icon={<Users size={14} aria-hidden />}>
          Circles
        </SectionLabel>

        {!loaded ? (
          <SkeletonText lines={3} />
        ) : publicCircle ? (
          <Card variant="elevated" className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <RoundAvatar size="md" />
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-xl font-semibold text-ink">
                  {publicCircle.name}
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                  {joined
                    ? "You're reading with this circle. Pick up the conversation where you left it."
                    : "An open circle reading the Psalms together. Read the reflections and digest, share your own, and talk it over — no account needed."}
                </p>
              </div>
            </div>
            {error && <Banner tone="error">{error}</Banner>}
            <button
              type="button"
              disabled={joining}
              onClick={() =>
                joined
                  ? router.push(`/circles/${publicCircle.id}`)
                  : void join()
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-base font-semibold text-ivory shadow-raised transition-all hover:bg-primary-dark disabled:opacity-60"
            >
              {joining ? "Joining…" : joined ? "Open circle" : "Join in one tap"}
              <ArrowRight size={18} aria-hidden />
            </button>
          </Card>
        ) : (
          <EmptyState
            icon="◎"
            heading="The public circle is warming up"
            subtext="Our open reading circle isn't available right now — please check back in a moment."
          />
        )}
      </div>

      {planSwitch && publicCircle && (
        <PlanSwitchDialog
          prompt={{
            circleName: publicCircle.name,
            planName: planSwitch.planName,
          }}
          isAnonymous
          busy={joining}
          onConfirm={() => void join(true)}
          onCancel={() => setPlanSwitch(null)}
        />
      )}
    </AppShell>
  );
}
