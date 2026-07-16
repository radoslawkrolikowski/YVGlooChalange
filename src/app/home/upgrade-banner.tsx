"use client";

import { useYouVersionSignIn } from "@/lib/use-youversion-sign-in";

// Step 8: the persistent upgrade affordance for anonymous sessions, pinned
// above the header on every app screen. Since Step 6 it starts the real
// YouVersion OAuth flow (the anonymous token is discarded on tap — Path A
// takes over from there).
export function UpgradeBanner() {
  const { start, busy, error } = useYouVersionSignIn();

  return (
    <aside className="sticky top-0 z-20 bg-primary-dark px-4 py-2.5 text-sm text-ivory">
      <div className="mx-auto flex max-w-lg flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span>Save your progress —</span>
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="font-semibold underline underline-offset-2 hover:text-primary-light disabled:opacity-70"
        >
          {busy ? "Opening YouVersion…" : "Sign in with YouVersion"}
        </button>
        {error && <p className="w-full text-xs text-primary-light">{error}</p>}
      </div>
    </aside>
  );
}
