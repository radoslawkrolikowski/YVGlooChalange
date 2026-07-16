"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";

/*
 * Editorial menu/popover (Step 8C): a trigger button that opens a small
 * anchored panel of actions. Built for the header avatar menu; generic enough
 * for later steps. Closes on outside pointer-down, Escape, or item selection.
 */

const MenuContext = createContext<{ close: () => void } | null>(null);

export function Menu({
  trigger,
  label,
  children,
}: {
  /** Content rendered inside the trigger button (e.g. avatar + chevron). */
  trigger: React.ReactNode;
  /** Accessible name for the trigger button. */
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-full p-1 transition-colors hover:bg-sage-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 flex min-w-44 flex-col rounded-md border border-line bg-surface p-1 shadow-raised"
        >
          <MenuContext.Provider value={{ close: () => setOpen(false) }}>
            {children}
          </MenuContext.Provider>
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  href,
  onSelect,
  icon,
  tone = "default",
  disabled = false,
  children,
}: {
  /** Renders as a link when set; otherwise a button calling onSelect. */
  href?: string;
  onSelect?: () => void;
  icon?: React.ReactNode;
  tone?: "default" | "danger";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const menu = useContext(MenuContext);
  const className = `flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-ink-faint ${
    tone === "danger"
      ? "text-danger hover:bg-danger-soft"
      : "text-ink hover:bg-sage-soft"
  }`;

  if (href) {
    return (
      <Link
        role="menuitem"
        href={href}
        className={className}
        onClick={() => menu?.close()}
      >
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={className}
      onClick={() => {
        menu?.close();
        onSelect?.();
      }}
    >
      {icon}
      {children}
    </button>
  );
}
