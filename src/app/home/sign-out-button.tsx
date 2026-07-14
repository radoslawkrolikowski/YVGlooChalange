"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";

// Compact sign-out action for the signed-in home header (Step 6). The profile
// screen keeps its own full-width sign-out; this puts the action one tap away
// from the home screen too.
export function SignOutButton() {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut({ redirectTo: "/" });
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-primary-light hover:text-primary disabled:opacity-60"
    >
      <LogOut size={16} aria-hidden />
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
