"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { useYouVersionSignIn } from "@/lib/use-youversion-sign-in";

export const ANON_TOKEN_STORAGE_KEY = "round.anonSessionToken";

// Step 8: the one-tap Path B entry. Mints an anonymous session server-side,
// keeps the signed token in sessionStorage only (gone when the browser
// session ends — nothing persists), and enters the app.
export function InstantAccessButton() {
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

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" full onClick={enter} disabled={busy}>
        {busy ? "Entering…" : "Try instantly"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

// Path A's primary CTA (Step 6): starts the real YouVersion OAuth flow. The
// busy label doubles as the loading state while the redirect happens.
export function SignInButton() {
  const { start, busy, error } = useYouVersionSignIn();

  return (
    <div className="flex flex-col gap-2">
      <Button full onClick={start} disabled={busy}>
        {busy ? "Opening YouVersion…" : "Sign in with YouVersion"}
      </Button>
      {error && <p className="text-center text-sm text-danger">{error}</p>}
    </div>
  );
}
