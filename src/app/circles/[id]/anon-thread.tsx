"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { SkeletonText } from "@/components/ui";
import type { CirclePlanDay, ThreadCircle, ThreadMessage } from "@/lib/circles";
import { useAnonSession } from "@/lib/use-anon-session";
import { UpgradeBanner } from "../../home/upgrade-banner";
import { CircleThread } from "./thread";

/*
 * Path B circle thread (Step 30). A signed-in member's thread is server-
 * rendered (page.tsx); an Instant Access visitor's session lives only in
 * sessionStorage, so their thread is fetched client-side with the session
 * header. This wrapper does the token dance, loads the public circle's thread
 * once, and renders the shared CircleThread with the anon token so its polling
 * and posting carry the header. A 403 (this isn't the public circle, or no
 * valid session) sends the visitor back to /circles rather than a dead end.
 *
 * Step 30A: arriving here also records membership in the token, so a visitor
 * who deep-links or is routed straight into the thread is a member of the
 * circle everywhere else too — /circles says "Open circle", and /plan and /read
 * show the circle's reading. The join is skipped when it would silently replace
 * a plan the visitor chose themselves: that case returns `plan_switch` and is
 * confirmed on the /circles card instead, never here behind their back.
 */
export function AnonCircleThread({ circleId }: { circleId: string }) {
  const session = useAnonSession();
  const router = useRouter();
  const [state, setState] = useState<
    | { status: "loading" }
    | {
        status: "ready";
        token: string;
        circle: ThreadCircle;
        messages: ThreadMessage[];
        reflectionDay: CirclePlanDay | null;
      }
  >({ status: "loading" });

  useEffect(() => {
    const stored = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
    if (!stored) {
      router.replace("/");
      return;
    }

    /** Record membership unless it would swap a chosen plan; returns the token
     * to read the thread with (the re-minted one when the join landed). */
    async function ensureMembership(token: string): Promise<string> {
      try {
        const response = await fetch(`/api/circles/${circleId}/join`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-round-session": token,
          },
          body: JSON.stringify({}),
        });
        const body = await response.json();
        if (body.ok && body.token) {
          sessionStorage.setItem(ANON_TOKEN_STORAGE_KEY, body.token);
          return body.token as string;
        }
      } catch {
        // Reading the thread never depends on the join — fall through.
      }
      return token;
    }

    let cancelled = false;
    ensureMembership(stored)
      .then((token) =>
        fetch(`/api/circles/${circleId}/messages`, {
          headers: { "x-round-session": token },
        }).then(async (response) => {
          const body = await response.json();
          if (cancelled) return;
          if (!response.ok || !body.ok || !body.circle) {
            router.replace("/circles");
            return;
          }
          setState({
            status: "ready",
            token,
            circle: body.circle as ThreadCircle,
            messages: body.messages as ThreadMessage[],
            reflectionDay: (body.reflectionDay as CirclePlanDay | null) ?? null,
          });
        }),
      )
      .catch(() => router.replace("/circles"));
    return () => {
      cancelled = true;
    };
  }, [circleId, router]);

  if (state.status === "loading" || !session) {
    return (
      <AppShell banner={<UpgradeBanner />}>
        <SkeletonText lines={6} />
      </AppShell>
    );
  }

  return (
    <AppShell
      banner={<UpgradeBanner />}
      headerAction={<HeaderMenu displayName={session.displayName} isAnonymous />}
    >
      <CircleThread
        circle={state.circle}
        // Anonymous posts have no user id; own-message alignment is a member
        // nicety we skip for Path B — their posts render as ordinary member rows
        // under their "Reader #n" name. The sentinel never matches an authorId.
        currentUserId=""
        initialMessages={state.messages}
        reflectionDay={state.reflectionDay}
        anonToken={state.token}
      />
    </AppShell>
  );
}
