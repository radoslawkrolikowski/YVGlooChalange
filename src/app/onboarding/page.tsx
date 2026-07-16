import { auth } from "@/lib/auth";
import { AnonOnboarding } from "./anon-onboarding";
import { OnboardingScreen } from "./onboarding-screen";

export const dynamic = "force-dynamic";

// Onboarding entry (Step 9). Path A resolves server-side like /home and
// /profile; everyone else falls through to the client-side Instant Access
// guard. Reached from sign-in (Home redirects here while language is unset)
// and from the Instant Access entry (skippable).
export default async function OnboardingPage() {
  const session = await auth();

  if (session?.user) {
    return (
      <OnboardingScreen
        displayName={session.user.name ?? "YouVersion reader"}
        initialLanguage={session.user.language}
        initialVersionId={session.user.bibleVersionId}
        isAnonymous={false}
      />
    );
  }

  return <AnonOnboarding />;
}
