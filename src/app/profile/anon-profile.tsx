"use client";

import { useRouter } from "next/navigation";
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
  SkeletonText,
} from "@/components/ui";
import { clearAnonSession, useAnonSession } from "@/lib/use-anon-session";
import { UpgradeBanner } from "../home/upgrade-banner";

/*
 * Anonymous profile (Steps 8/8A). Shows the session identity and a working
 * "End session" action. The highlights section renders the production layout
 * — count, revoke with a confirmation step — fed by real data once Step 7
 * lands.
 */
export function AnonProfile() {
  const router = useRouter();
  const session = useAnonSession();
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  if (!session) {
    return (
      <AppShell>
        <SkeletonText lines={4} />
      </AppShell>
    );
  }

  function endSession() {
    clearAnonSession();
    router.replace("/");
  }

  return (
    <AppShell banner={<UpgradeBanner />}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Avatar name={session.displayName} size="lg" />
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
              {session.displayName}
            </h1>
            <Badge status="neutral">Anonymous session</Badge>
          </div>
        </div>

        <Card className="flex flex-col gap-3">
          <SectionHeader title="Imported highlights" />
          <p className="text-2xl font-bold text-ink">
            0 <span className="text-sm font-normal text-ink-soft">highlights</span>
          </p>
          <p className="text-sm text-ink-soft">
            Highlight import needs a YouVersion account. Sign in to bring your
            highlights into Round.
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
          <SectionHeader title="Session" />
          <p className="text-sm text-ink-soft">
            You are browsing anonymously. Ending the session discards
            everything — nothing is stored.
          </p>
          <Button variant="destructive" full onClick={endSession}>
            End session
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}
