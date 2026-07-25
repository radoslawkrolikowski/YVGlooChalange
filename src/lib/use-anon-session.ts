"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import type { AnonSession } from "@/lib/anon-session";

/*
 * Client-side guard for app-interior screens (Step 8/8A). Validates the
 * sessionStorage token against the server resolver; with no valid session
 * the visitor is sent back to the landing page. Signed-in (Path A) sessions
 * plug into this resolver when Step 6 lands.
 */
export function useAnonSession(): AnonSession | null {
  const router = useRouter();
  const [session, setSession] = useState<AnonSession | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
    if (!token) {
      router.replace("/");
      return;
    }
    fetch("/api/session/me", { headers: { "x-round-session": token } })
      .then((response) => response.json())
      .then((body) => {
        if (body.ok && body.session.kind === "anonymous") {
          setSession(body.session);
        } else {
          sessionStorage.removeItem(ANON_TOKEN_STORAGE_KEY);
          router.replace("/");
        }
      })
      .catch(() => router.replace("/"));
  }, [router]);

  return session;
}

export function clearAnonSession() {
  // Dropping the token ends the session: everything tagged with its session id
  // (reflections, messages, highlights, saved prayers, notifications) becomes
  // unreachable at once — no client-side store to clear since Step 30A — and is
  // deleted outright by the Step 31 prune.
  sessionStorage.removeItem(ANON_TOKEN_STORAGE_KEY);
}
