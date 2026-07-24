import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { auth } from "@/lib/auth";
import {
  isCircleMember,
  loadCirclePlanDay,
  loadThreadCircle,
  loadThreadMessages,
  type CirclePlanDay,
} from "@/lib/circles";
import { loadOwnReflection } from "@/lib/reflections";
import { CircleThread } from "./thread";

export const dynamic = "force-dynamic";

// The circle thread screen (Step 17; extended in Step 19): a member's
// messaging surface for one circle, composed in the 8C responsive shell. Path A
// only — anonymous sessions have no circle membership until the demo circle
// (Step 30), so they fall back to /circles. Membership is the access gate: a
// non-member (or a missing circle) is bounced to the circles list.
//
// Step 19: arriving with ?reflect=<dayNumber> (from "Finished reading") primes
// the composer for a reflection on that plan day. The day is resolved from the
// circle's own plan server-side — a bad or unknown param simply falls back to
// ordinary chat.
export default async function CircleThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reflect?: string }>;
}) {
  const { id: circleId } = await params;
  const { reflect } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/circles");

  const [circle, member] = await Promise.all([
    loadThreadCircle(circleId),
    isCircleMember(session.user.id, circleId),
  ]);
  if (!circle || !member) redirect("/circles");

  // Render in the reader's own language: attach their cached translations
  // (Step 27). A reader without a set language sees every message in original.
  const initialMessages = await loadThreadMessages(
    circleId,
    session.user.language,
  );

  // Resolve the reflection day only for a well-formed, real plan day.
  let reflectionDay: CirclePlanDay | null = null;
  const reflectDay = reflect ? Number(reflect) : NaN;
  if (Number.isInteger(reflectDay) && reflectDay >= 1) {
    reflectionDay = await loadCirclePlanDay(circleId, reflectDay);
  }

  // Reflecting twice on a day is allowed; the composer just says so, so the
  // second one is deliberate (Step 19).
  const alreadyReflected = reflectionDay
    ? (await loadOwnReflection(
        circleId,
        session.user.id,
        reflectionDay.dayNumber,
      )) !== null
    : false;

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
        reflectionDay={reflectionDay}
        alreadyReflected={alreadyReflected}
      />
    </AppShell>
  );
}
