import { redirect } from "next/navigation";
import { HeaderMenu } from "@/components/layout/header-menu";
import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth";
import { loadUserPlanState } from "@/lib/plans";
import { AnonHome } from "./anon-home";
import { HomeScreen } from "./home-screen";

export const dynamic = "force-dynamic";

// Home resolves the session server-side: a signed-in YouVersion user (Path A,
// Step 6) gets the 8C home with the avatar menu in the header; otherwise the
// client-side Instant Access home (Path B, Step 8) takes over.
export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    // Path A's post-OAuth order follows the brief: highlight-import consent
    // (Step 7) is asked once, before onboarding; then onboarding completes
    // before Home, since language drives every passage fetch and translation
    // target (Step 9).
    if (session.user.highlightsConsent === null) redirect("/consent");
    if (session.user.language === null) redirect("/onboarding");
    const displayName = session.user.name ?? "YouVersion reader";
    const planState = await loadUserPlanState(session.user.id);
    return (
      <AppShell
        headerAction={
          <HeaderMenu displayName={displayName} isAnonymous={false} />
        }
      >
        <HomeScreen
          displayName={displayName}
          language={session.user.language}
          bibleVersionId={session.user.bibleVersionId}
          isAnonymous={false}
          reading={
            planState
              ? {
                  dayNumber: planState.currentDay,
                  passageReference: planState.today.label,
                }
              : null
          }
        />
      </AppShell>
    );
  }

  return <AnonHome />;
}
