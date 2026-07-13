"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

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

// Path A's primary CTA. The real YouVersion OAuth flow is Step 6 (currently
// deferred) — until it lands, tapping explains that instead of redirecting.
export function SignInButton() {
  const [note, setNote] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Button full onClick={() => setNote(true)}>
        Sign in with YouVersion
      </Button>
      {note && (
        <p className="text-center text-sm text-ink-soft">
          Sign-in with YouVersion is coming soon (Step 6). Try Round instantly
          below in the meantime.
        </p>
      )}
    </div>
  );
}
