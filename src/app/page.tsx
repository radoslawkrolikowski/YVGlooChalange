import { Wordmark } from "@/components/layout/wordmark";
import { InstantAccessButton, SignInButton } from "./instant-access-button";

// Landing page (Step 8A polish). Both CTAs above the fold on a 390px
// viewport; Path A's real OAuth flow arrives with Step 6.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-between px-6 py-10">
      <div className="pt-6">
        <Wordmark size="lg" />
      </div>

      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold leading-snug text-ink">
          Read the Bible together,
          <br />
          <span className="text-primary">a few pages at a time.</span>
        </h1>
        <p className="text-base text-ink-soft">
          Round puts you in a small reading circle with a shared plan — and an
          AI facilitator that keeps the conversation going.
        </p>
      </div>

      <div className="flex flex-col gap-3 pb-4">
        <SignInButton />
        <InstantAccessButton />
        <p className="text-center text-xs text-ink-faint">
          Instant access needs no form and no account. Nothing is saved after
          you close the browser.
        </p>
      </div>
    </main>
  );
}
