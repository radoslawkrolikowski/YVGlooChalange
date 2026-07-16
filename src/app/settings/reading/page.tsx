import { auth } from "@/lib/auth";
import { AnonReadingSettings } from "./anon-reading-settings";
import { ReadingSettingsScreen } from "./reading-settings-screen";

export const dynamic = "force-dynamic";

// Reading settings entry (Step 9), mirroring /profile's session split.
export default async function ReadingSettingsPage() {
  const session = await auth();

  if (session?.user) {
    return (
      <ReadingSettingsScreen
        displayName={session.user.name ?? "YouVersion reader"}
        initialLanguage={session.user.language}
        initialVersionId={session.user.bibleVersionId}
        isAnonymous={false}
      />
    );
  }

  return <AnonReadingSettings />;
}
