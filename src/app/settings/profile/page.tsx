import { auth } from "@/lib/auth";
import { loadUserProfileAnswers } from "@/lib/profile";
import { AnonProfileSettings } from "./anon-profile-settings";
import { ProfileSettingsScreen } from "./profile-settings-screen";

export const dynamic = "force-dynamic";

// Profile settings entry (Step 10), mirroring /settings/reading's split.
export default async function ProfileSettingsPage() {
  const session = await auth();

  if (session?.user) {
    return (
      <ProfileSettingsScreen
        displayName={session.user.name ?? "YouVersion reader"}
        initialAnswers={await loadUserProfileAnswers(session.user.id)}
        isAnonymous={false}
      />
    );
  }

  return <AnonProfileSettings />;
}
