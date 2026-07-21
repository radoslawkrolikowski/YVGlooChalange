import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderMenu } from "@/components/layout/header-menu";
import { auth } from "@/lib/auth";
import { loadUserCircle } from "@/lib/circles";
import { AnonCircles } from "../anon-circles";
import { MatchScreen } from "./match-screen";

export const dynamic = "force-dynamic";

// The match screen (Step 21), mirroring /circles' session split. A user who
// already belongs to a circle is sent back to it rather than being matched
// again — Step 16 allows one circle per user, and matching must never be the
// path that quietly breaks that rule.
export default async function MatchPage() {
  const session = await auth();
  if (!session?.user) return <AnonCircles />;

  const circle = await loadUserCircle(session.user.id);
  if (circle) redirect(`/circles/${circle.id}`);

  return (
    <AppShell
      headerAction={
        <HeaderMenu
          displayName={session.user.name ?? "YouVersion reader"}
          isAnonymous={false}
        />
      }
    >
      <MatchScreen />
    </AppShell>
  );
}
