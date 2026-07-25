import { auth } from "@/lib/auth";
import {
  loadHighlightSummary,
  loadSessionHighlightList,
} from "@/lib/highlights";
import { loadNotesList } from "@/lib/notes";
import { loadUserProfileAnswers } from "@/lib/profile";
import { AnonProfile } from "./anon-profile";
import { UserProfile } from "./user-profile";

export const dynamic = "force-dynamic";

// Profile resolves the session server-side, mirroring /home: signed-in users
// (Path A) get the YouVersion identity and sign-out; everyone else falls
// through to the anonymous profile.
export default async function ProfilePage() {
  const session = await auth();

  if (session?.user) {
    return (
      <UserProfile
        displayName={session.user.name ?? "YouVersion reader"}
        language={session.user.language}
        bibleVersionId={session.user.bibleVersionId}
        profileAnswers={await loadUserProfileAnswers(session.user.id)}
        highlightSummary={await loadHighlightSummary(session.user.id)}
        highlightsConsent={session.user.highlightsConsent}
        sessionHighlights={await loadSessionHighlightList({
          kind: "user",
          userId: session.user.id,
        })}
        notes={await loadNotesList(session.user.id)}
      />
    );
  }

  return <AnonProfile />;
}
