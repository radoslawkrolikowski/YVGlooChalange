import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { auth } from "@/lib/auth";
import { listOpenCircles, loadUserCircle } from "@/lib/circles";
import { AnonCircles } from "./anon-circles";
import { CirclesScreen } from "./circles-screen";

export const dynamic = "force-dynamic";

// The /circles tab (Step 16), mirroring /home and /plan's session split: Path A
// resolves the user's circle and the open-circle list server-side; everyone
// else falls through to the client-side Instant Access guard.
export default async function CirclesPage() {
  const session = await auth();

  if (session?.user) {
    const [circle, open] = await Promise.all([
      loadUserCircle(session.user.id),
      listOpenCircles(session.user.id),
    ]);
    return (
      <AppShell
        headerAction={
          <HeaderMenu
            displayName={session.user.name ?? "YouVersion reader"}
            isAnonymous={false}
          />
        }
      >
        <CirclesScreen initialCircle={circle} initialOpen={open} />
      </AppShell>
    );
  }

  return <AnonCircles />;
}
