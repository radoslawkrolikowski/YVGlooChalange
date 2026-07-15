"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  SectionHeader,
} from "@/components/ui";

/*
 * Signed-in profile (Step 6): YouVersion identity plus the styled sign-out
 * action. The highlights section keeps the 8A production layout with an
 * explanatory empty state until Step 7 imports real highlights.
 */
export function UserProfile({ displayName }: { displayName: string }) {
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
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
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Avatar name={displayName} size="lg" />
          <div>
            <h1 className="text-xl font-bold text-ink">{displayName}</h1>
            <Badge status="active">YouVersion account</Badge>
          </div>
        </div>

        <Card className="flex flex-col gap-3">
          <SectionHeader title="Imported highlights" />
          <p className="text-2xl font-bold text-ink">
            0 <span className="text-sm font-normal text-ink-soft">highlights</span>
          </p>
          <p className="text-sm text-ink-soft">
            Highlight import arrives with the next update. You'll choose
            exactly what is imported and why before anything is stored.
          </p>
          <Divider />
          {confirmingRevoke ? (
            <div className="flex flex-col gap-2">
              <Banner tone="warning">
                Delete all imported highlights from Round? This cannot be
                undone. Your highlights in the YouVersion app are not affected.
              </Banner>
              <div className="flex gap-2">
                <Button variant="destructive" disabled className="flex-1">
                  Delete highlights
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setConfirmingRevoke(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmingRevoke(true)}>
              Revoke &amp; delete imported highlights
            </Button>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <SectionHeader title="Account" />
          <p className="text-sm text-ink-soft">
            You're signed in with YouVersion. Your circles, plans, and
            highlights stay saved between visits.
          </p>
          <Button
            variant="destructive"
            full
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}
