import { fetchPassage } from "@/lib/youversion";
import { LICENSED_FALLBACK_BY_LANGUAGE } from "@/config/bible-versions";
import { Hero, type HeroVerse } from "./landing/hero";
import { LandingNav } from "./landing/nav";
import {
  AiTeam,
  FinalCta,
  HowItWorks,
  SocialProof,
  ValueProps,
} from "./landing/sections";

// Revalidate daily — the hero verse is fetched live from YouVersion (Bible
// text is never hardcoded, per the brief) and cached between builds.
export const revalidate = 86400;

// Psalm 133:1 — the unity-of-brothers verse the hero quotes, fetched in the
// app's licensed English version. On any failure the hero simply omits the
// quote; it never falls back to embedded text.
async function heroVerse(): Promise<HeroVerse | null> {
  try {
    const passage = await fetchPassage(
      "PSA.133.1",
      LICENSED_FALLBACK_BY_LANGUAGE.en,
    );
    // The API returns Psalm superscriptions ("A song of ascents. Of David.")
    // as part of verse 1; drop that heading for display. The verse text
    // itself is rendered exactly as YouVersion returned it.
    const text = passage.content
      .replace(/\s+/g, " ")
      .replace(/^A song of ascents\.( Of David\.)?\s*/i, "")
      .trim();
    if (!text) return null;
    return {
      text,
      reference: passage.reference,
      versionAbbreviation: passage.versionAbbreviation,
    };
  } catch {
    return null;
  }
}

// NextAuth redirects sign-in failures back here with ?error=<code> (the
// error "page" is the landing page, per the step spec: an error banner,
// never a raw error page). Codes are mapped to friendly copy.
function signInErrorMessage(code: string): string {
  switch (code) {
    case "OAuthAccountNotLinked":
      return "This YouVersion account is already linked to a different Round profile. Try signing in the way you did before.";
    case "AccessDenied":
      return "Sign-in was cancelled. You can try again whenever you're ready.";
    case "Configuration":
      return "Sign-in isn't configured correctly on our side. Please try again later.";
    default:
      return "We couldn't complete your YouVersion sign-in. Please try again.";
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [verse, params] = await Promise.all([heroVerse(), searchParams]);
  const signInError = params.error ? signInErrorMessage(params.error) : null;

  return (
    <div className="min-h-dvh bg-parchment text-charcoal">
      <LandingNav />
      <main>
        {signInError && (
          <div className="mx-auto w-full max-w-6xl px-6 lg:px-10" role="alert">
            <p className="rounded-2xl border border-danger/25 bg-danger-soft px-5 py-3.5 text-sm font-medium text-danger">
              {signInError}
            </p>
          </div>
        )}
        <Hero verse={verse} />
        <ValueProps />
        <HowItWorks />
        <AiTeam />
        <SocialProof />
        <FinalCta />
      </main>
      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 pb-10 text-xs text-charcoal/45 lg:px-10">
        <span>Round — Scripture reading circles</span>
        <span>Bible text from YouVersion</span>
      </footer>
    </div>
  );
}
