"use client";

import { ChevronDown, LogOut, User } from "lucide-react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, Menu, MenuItem } from "@/components/ui";
import { clearAnonSession } from "@/lib/use-anon-session";
import { NotificationBell } from "./notification-bell";

/*
 * Header avatar menu (Step 8C): initials avatar + chevron opening "Profile"
 * and "Sign out" (Path A) or "End session" (Path B). Replaces the plain
 * sign-out text button in the home header — the sign-out action relocated,
 * not removed.
 */
export function HeaderMenu({
  displayName,
  isAnonymous,
}: {
  displayName: string;
  isAnonymous: boolean;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function leave() {
    if (isAnonymous) {
      clearAnonSession();
      router.replace("/");
      return;
    }
    setSigningOut(true);
    try {
      await signOut({ redirectTo: "/" });
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {/* Notification bell — both paths since Step 30A: an anonymous session's
          notifications are session-scoped rather than absent, so the surface
          works in the demo. Sits left of the account menu. */}
      <NotificationBell />
      <Menu
        label="Account menu"
        trigger={
          <>
            {/* "Reader #4" would yield "R#" initials; drop the "#" so the
                anonymous avatar reads "R4". */}
            <Avatar name={displayName.replace("#", "")} size="sm" />
            <ChevronDown size={16} aria-hidden className="text-ink-faint" />
          </>
        }
      >
        <MenuItem href="/profile" icon={<User size={16} aria-hidden />}>
          Profile
        </MenuItem>
        <MenuItem
          tone="danger"
          disabled={signingOut}
          onSelect={leave}
          icon={<LogOut size={16} aria-hidden />}
        >
          {isAnonymous
            ? "End session"
            : signingOut
              ? "Signing out…"
              : "Sign out"}
        </MenuItem>
      </Menu>
    </div>
  );
}
