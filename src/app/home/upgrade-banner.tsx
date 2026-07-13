"use client";

import { useState } from "react";

// Step 8: the persistent upgrade affordance for anonymous sessions, pinned
// above the header on every app screen. The actual YouVersion OAuth flow is
// Step 6 (currently deferred) — tapping explains that until it lands.
export function UpgradeBanner() {
  const [note, setNote] = useState(false);

  return (
    <aside className="sticky top-0 z-20 bg-primary-dark px-4 py-2.5 text-sm text-white">
      <div className="mx-auto flex max-w-lg flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span>Save your progress —</span>
        <button
          type="button"
          onClick={() => setNote(true)}
          className="font-semibold underline underline-offset-2 hover:text-primary-light"
        >
          Sign in with YouVersion
        </button>
        {note && (
          <p className="w-full text-xs text-primary-light">
            Sign-in with YouVersion is coming soon (Step 6). Your current
            session stays anonymous.
          </p>
        )}
      </div>
    </aside>
  );
}
