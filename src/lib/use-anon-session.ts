"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import { clearAnonHighlights } from "@/lib/anon-highlights";
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
  sessionStorage.removeItem(ANON_TOKEN_STORAGE_KEY);
  // Session highlights (Step 14) belong to the session — gone with it.
  clearAnonHighlights();
}
