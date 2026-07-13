"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <div>
      <button
        type="button"
        onClick={enter}
        disabled={busy}
        style={{ padding: "0.6rem 1.4rem", fontSize: "1rem" }}
      >
        {busy ? "Entering…" : "Try Round instantly"}
      </button>
      <p style={{ fontSize: "0.85rem", color: "#666" }}>
        No form, no account. Nothing is saved after you close the browser.
      </p>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
    </div>
  );
}
