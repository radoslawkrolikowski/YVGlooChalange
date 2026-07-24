"use client";

import { ArrowRight, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import {
  Card,
  EmptyState,
  RoundAvatar,
  SectionLabel,
  SkeletonText,
} from "@/components/ui";
import { useAnonSession } from "@/lib/use-anon-session";
import { UpgradeBanner } from "../home/upgrade-banner";

/*
 * Path B /circles tab (Step 16; Step 30). An Instant Access visitor has no user
 * row, so creating and joining a matched circle still need a YouVersion account
 * — but the PUBLIC demo circle ("Public Round Circle — Psalms") is open to
 * anyone in one tap (Step 30). This screen leads with that: read, reflect, and
 * converse with a live AI member and other visitors, no sign-up. Signing in is
 * offered as the way to a private matched circle, never as a gate to the demo.
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
                  An open circle reading the Psalms together. Read the
                  reflections and digest, share your own, and talk it over — no
                  account needed.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/circles/${publicCircle.id}`)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-base font-semibold text-ivory shadow-raised transition-all hover:bg-primary-dark"
            >
              Join in one tap
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
    </AppShell>
  );
}
