"use client";

import Link from "next/link";
import { Wordmark } from "@/components/layout/wordmark";
import { useYouVersionSignIn } from "@/lib/use-youversion-sign-in";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#circles", label: "For groups" },
  { href: "#ai-team", label: "About" },
] as const;

const ctaClass =
  "rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory transition-colors hover:bg-forest-deep disabled:opacity-60";

export function LandingNav({ authenticated }: { authenticated: boolean }) {
  const { start, busy } = useYouVersionSignIn();

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 lg:px-10">
      <Wordmark />
      <nav aria-label="Landing navigation" className="hidden items-center gap-8 md:flex">
        {links.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            className="text-sm font-medium text-charcoal/70 transition-colors hover:text-forest"
          >
            {label}
          </a>
        ))}
      </nav>
      {authenticated ? (
        <Link href="/home" className={ctaClass}>
          Open Round
        </Link>
      ) : (
        <button type="button" onClick={start} disabled={busy} className={ctaClass}>
          {busy ? "Opening…" : "Sign in"}
        </button>
      )}
    </header>
  );
}
