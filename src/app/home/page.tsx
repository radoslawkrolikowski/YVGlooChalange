import { HeaderMenu } from "@/components/layout/header-menu";
import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth";
import { AnonHome } from "./anon-home";
import { HomeScreen } from "./home-screen";

export const dynamic = "force-dynamic";

// Home resolves the session server-side: a signed-in YouVersion user (Path A,
// Step 6) gets the 8C home with the avatar menu in the header; otherwise the
// client-side Instant Access home (Path B, Step 8) takes over.
export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    const displayName = session.user.name ?? "YouVersion reader";
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
        />
      </AppShell>
    );
  }

  return <AnonHome />;
}
