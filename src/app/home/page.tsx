import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth";
import { AnonHome } from "./anon-home";
import { HomeScreen } from "./home-screen";

export const dynamic = "force-dynamic";

// Home resolves the session server-side: a signed-in YouVersion user (Path A,
// Step 6) gets the same 8A home layout with their display name and no upgrade
// banner; otherwise the client-side Instant Access home (Path B, Step 8)
// takes over.
export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    return (
      <AppShell>
        <HomeScreen
          displayName={session.user.name ?? "YouVersion reader"}
          language={session.user.language}
          bibleVersionId={session.user.bibleVersionId}
          isAnonymous={false}
        />
      </AppShell>
    );
  }

  return <AnonHome />;
}
