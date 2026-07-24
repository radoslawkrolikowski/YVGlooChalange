"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./wordmark";

/*
 * Responsive layout shell (Step 8A, made responsive in Step 8C).
 *
 * Mobile (<768px): top header (wordmark left, actions right), bottom tab
 * bar, single column — unchanged from 8A. Desktop (≥768px): the bottom tab
 * bar hides, the four nav links render inline in the header with an active
 * state, and the content column widens from max-w-lg to max-w-3xl with the
 * same card composition. All app-interior screens render inside this shell;
 * the landing page does not.
 */

const tabs = [
  { href: "/home", label: "Home", icon: HomeIcon },
  { href: "/plan", label: "My Plan", icon: BookIcon },
  { href: "/circles", label: "Circles", icon: CirclesIcon },
  { href: "/prayer", label: "Prayer", icon: PrayerIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  headerAction,
  banner,
  children,
}: {
  headerAction?: React.ReactNode;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col bg-surface-soft">
      {banner}
      <header
        className="sticky top-0 z-10 border-b border-line bg-surface px-4"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4 py-3 md:max-w-3xl">
          <Link href="/home" aria-label="Round home">
            <Wordmark />
          </Link>

          {/* Desktop-only inline navigation; mobile keeps the bottom tabs. */}
          <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
            {tabs.map(({ href, label }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-primary-light text-primary-dark"
                      : "text-ink-soft hover:bg-sage-soft hover:text-ink"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {/* Step 29's notification bell lands here, left of the action. */}
            {headerAction}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-24 md:pb-8">
        <div className="mx-auto w-full max-w-lg md:max-w-3xl">{children}</div>
      </main>

      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-lg">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
                  active ? "text-primary" : "text-ink-faint hover:text-ink-soft"
                }`}
              >
                <Icon />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 6c-1.5-1.6-3.7-2.5-6-2.5H4V19h2c2.3 0 4.5.9 6 2.5 1.5-1.6 3.7-2.5 6-2.5h2V3.5h-2c-2.3 0-4.5.9-6 2.5Z" />
      <path d="M12 6v15.5" />
    </svg>
  );
}

function CirclesIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.5-3.5 4.2-5 7.5-5s6 1.5 7.5 5" />
    </svg>
  );
}

function PrayerIcon() {
  // Two hands joined in prayer.
  return (
    <svg {...iconProps}>
      <path d="M12 3c-1 2.5-2.2 4-3.7 5.5C7 10 6.5 11 6.5 12.5V19c0 1 .8 2 2 2H12" />
      <path d="M12 3c1 2.5 2.2 4 3.7 5.5C17 10 17.5 11 17.5 12.5V19c0 1-.8 2-2 2H12" />
      <path d="M12 3v18" />
    </svg>
  );
}
