"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";

// Step 8's one-tap Path B entry, extracted so every landing CTA can trigger
// it. Mints an anonymous session server-side, keeps the signed token in
// sessionStorage only, and enters the app.
export function useInstantAccess() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/session/instant", { method: "POST" });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? "Could not start a session");
      sessionStorage.setItem(ANON_TOKEN_STORAGE_KEY, body.token);
      router.push("/home");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
      setBusy(false);
    }
  }

  return { enter, busy, error };
}
