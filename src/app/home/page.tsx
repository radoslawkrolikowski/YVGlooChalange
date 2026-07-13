"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { findSupportedVersion } from "@/config/bible-versions";
import type { AnonSession } from "@/lib/anon-session";
import { ANON_TOKEN_STORAGE_KEY } from "../instant-access-button";
import { UpgradeBanner } from "./upgrade-banner";

// Step 8: the app interior an Instant Access visitor lands on. Validates the
// sessionStorage token against the server resolver; with no valid session it
// sends the visitor back to the landing page. Later steps replace the body
// (onboarding, plan, passage) — the session handling stays.
export default function HomePage() {
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

  if (!session) {
    return (
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "3rem 1rem" }}>
        <p>Loading…</p>
      </main>
    );
  }

  const version = findSupportedVersion(session.bibleVersionId);

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "3rem 1rem" }}>
      <h1>Welcome, {session.displayName}</h1>
      <dl>
        <dt>Language</dt>
        <dd>English (default)</dd>
        <dt>Bible version</dt>
        <dd>
          {version
            ? `${version.abbreviation} — ${version.title}`
            : `version ${session.bibleVersionId}`}{" "}
          (default)
        </dd>
        <dt>Reading plan</dt>
        <dd>Default plan — plan selection arrives with Step 11</dd>
      </dl>
      <UpgradeBanner />
    </main>
  );
}
