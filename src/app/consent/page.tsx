import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConsentScreen } from "./consent-screen";

export const dynamic = "force-dynamic";

// Highlight import consent — Step 7. Shown once, right after YouVersion
// sign-in (Home redirects here while the consent answer is unrecorded).
// Path A only: anonymous visitors have no YouVersion highlights to import.
export default async function ConsentPage() {
  const session = await auth();
  if (!session?.user) redirect("/home");
  if (session.user.highlightsConsent !== null) redirect("/home");

  return <ConsentScreen />;
}
