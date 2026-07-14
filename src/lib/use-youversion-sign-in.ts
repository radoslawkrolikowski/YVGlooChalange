"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";

// Step 6's Path A entry, shared by every "Sign in with YouVersion" CTA.
// `busy` stays true until the browser navigates away to YouVersion — that is
// the OAuth redirect loading state. Any anonymous Instant Access token is
// discarded first: once a user signs in, Path A owns the session.
export function useYouVersionSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      sessionStorage.removeItem(ANON_TOKEN_STORAGE_KEY);
      await signIn("youversion", { redirectTo: "/home" });
    } catch {
      setError("Could not start YouVersion sign-in. Please try again.");
      setBusy(false);
    }
  }

  return { start, busy, error };
}
