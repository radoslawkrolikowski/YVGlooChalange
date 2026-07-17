import { auth } from "@/lib/auth";
import { loadUserProfileAnswers } from "@/lib/profile";
import { AnonAbout } from "./anon-about";
import { AboutScreen } from "./about-screen";

export const dynamic = "force-dynamic";

// Onboarding step 2 entry (Step 10), mirroring /onboarding's session split.
export default async function AboutPage() {
  const session = await auth();

  if (session?.user) {
    return (
      <AboutScreen
        displayName={session.user.name ?? "YouVersion reader"}
        initialAnswers={await loadUserProfileAnswers(session.user.id)}
        isAnonymous={false}
      />
    );
  }

  return <AnonAbout />;
}
