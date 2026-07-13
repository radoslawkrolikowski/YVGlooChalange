import { Avatar } from "@/components/ui";
import { Wordmark } from "@/components/layout/wordmark";
import { InstantAccessButton, SignInButton } from "./instant-access-button";

/*
 * Landing page (Step 8A). Warm and intimate by design: serif headline, soft
 * teal wash, a small circle-of-readers motif — an invitation to read with a
 * few people, not a product pitch. Both CTAs above the fold at 390px; Path
 * A's real OAuth flow arrives with Step 6.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-between bg-gradient-to-b from-primary-light via-surface to-surface px-6 py-10">
      <div className="pt-4">
        <Wordmark size="lg" />
      </div>

      <div className="flex flex-col items-center gap-6 text-center">
        <ReadingCircleMotif />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Scripture reading circles
        </p>
        <h1 className="font-serif text-2xl leading-snug text-ink">
          Some things are better
          <br />
          read <em className="text-primary-dark">together</em>.
        </h1>
        <p className="max-w-xs text-base leading-relaxed text-ink-soft">
          Round gathers a few people around the same reading plan, and gently
          keeps the conversation going.
        </p>
      </div>

      <div className="flex flex-col gap-3 pb-4">
        <SignInButton />
        <InstantAccessButton />
        <p className="text-center text-xs leading-relaxed text-ink-faint">
          No form, no account needed to try. Nothing is saved after you close
          the browser.
        </p>
      </div>
    </main>
  );
}

// Three overlapping reader circles — the shape of a Round circle, not a
// feature illustration. Decorative only.
function ReadingCircleMotif() {
  return (
    <div aria-hidden className="flex -space-x-2.5">
      <span className="rounded-full ring-4 ring-surface">
        <Avatar name="R" size="lg" />
      </span>
      <span className="rounded-full ring-4 ring-surface">
        <Avatar name="O" size="lg" />
      </span>
      <span className="rounded-full ring-4 ring-surface">
        <Avatar name="U" size="lg" />
      </span>
    </div>
  );
}
