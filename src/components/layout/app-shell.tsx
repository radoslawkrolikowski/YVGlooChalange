"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./wordmark";

/*
 * Mobile-first layout shell (Step 8A): safe-area-aware page wrapper, top
 * header bar (logo left, action right), scrollable content area, bottom
 * navigation. All app-interior screens render inside this shell; the
 * landing page does not (it has no navigation yet).
 */

const tabs = [
  { href: "/home", label: "Home", icon: HomeIcon },
  { href: "/plan", label: "My Plan", icon: BookIcon },
  { href: "/circles", label: "Circles", icon: CirclesIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
] as const;

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
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-surface-soft">
      {banner}
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <Link href="/home" aria-label="Round home">
          <Wordmark />
        </Link>
        {headerAction}
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-24">{children}</main>

      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-lg">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
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
