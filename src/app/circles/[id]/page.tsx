import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { auth } from "@/lib/auth";
import {
  isCircleMember,
  loadThreadCircle,
  loadThreadMessages,
} from "@/lib/circles";
import { CircleThread } from "./thread";

export const dynamic = "force-dynamic";

// The circle thread screen (Step 17): a member's messaging surface for one
// circle, composed in the 8C responsive shell. Path A only — anonymous
// sessions have no circle membership until the demo circle (Step 30), so they
// fall back to /circles. Membership is the access gate: a non-member (or a
// missing circle) is bounced to the circles list rather than shown a thread.
export default async function CircleThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: circleId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/circles");

  const [circle, member] = await Promise.all([
    loadThreadCircle(circleId),
    isCircleMember(session.user.id, circleId),
  ]);
  if (!circle || !member) redirect("/circles");

  const initialMessages = await loadThreadMessages(circleId);

  return (
    <AppShell
      headerAction={
        <HeaderMenu
          displayName={session.user.name ?? "YouVersion reader"}
          isAnonymous={false}
        />
      }
    >
      <CircleThread
        circle={circle}
        currentUserId={session.user.id}
        initialMessages={initialMessages}
      />
    </AppShell>
  );
}
