import { auth } from "@/lib/auth";
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
      <UserProfile displayName={session.user.name ?? "YouVersion reader"} />
    );
  }

  return <AnonProfile />;
}
