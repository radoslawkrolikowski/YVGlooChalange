import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { auth } from "@/lib/auth";
import { loadUserCircle } from "@/lib/circles";
import { AnonPrayer } from "./anon-prayer";
import { PrayerScreen } from "./prayer-screen";

export const dynamic = "force-dynamic";

// Step 26 — the Prayer tab. A signed-in user (Path A) gets the full tab with
// the avatar menu; onboarding must be complete first (language drives the
// prayer's target language, same as every other AI surface). Anonymous
// visitors (Path B) get the client-side variant.
export default async function PrayerPage() {
  const session = await auth();

  if (session?.user) {
    if (session.user.highlightsConsent === null) redirect("/consent");
    if (session.user.language === null) redirect("/onboarding");
    const displayName = session.user.name ?? "YouVersion reader";
    const circle = await loadUserCircle(session.user.id);
    return (
      <AppShell
        headerAction={<HeaderMenu displayName={displayName} isAnonymous={false} />}
      >
        <PrayerScreen isAnonymous={false} hasCircle={circle !== null} />
      </AppShell>
    );
  }

  return <AnonPrayer />;
}
