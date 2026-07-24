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
    const token = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
    if (!token) {
      router.replace("/");
      return;
    }
    fetch(`/api/circles/${circleId}/messages`, {
      headers: { "x-round-session": token },
    })
      .then(async (response) => {
        const body = await response.json();
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
      })
      .catch(() => router.replace("/circles"));
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
