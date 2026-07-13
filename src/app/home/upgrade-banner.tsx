"use client";

import { useState } from "react";

// Step 8: the persistent upgrade affordance for anonymous sessions. The
// actual YouVersion OAuth flow is Step 6 (currently deferred) — tapping the
// button explains that until it lands.
export function UpgradeBanner() {
  const [note, setNote] = useState(false);

  return (
    <aside
      style={{
        position: "sticky",
        bottom: 0,
        marginTop: "2rem",
        padding: "0.75rem 1rem",
        border: "1px solid #ccc",
        borderRadius: 8,
        background: "#fafafa",
      }}
    >
      <span style={{ marginRight: "0.75rem" }}>Save your progress —</span>
      <button type="button" onClick={() => setNote(true)}>
        Sign in with YouVersion
      </button>
      {note && (
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#666" }}>
          Sign-in with YouVersion is coming soon (Step 6). Your current session
          stays anonymous.
        </p>
      )}
    </aside>
  );
}
