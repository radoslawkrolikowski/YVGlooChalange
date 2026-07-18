"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";

// The landing page's pill button is the canonical shape (Step 8B): forest
// fill, rounded-full, gentle hover lift. All variants share the pill.
const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-base font-semibold transition-all " +
  "hover:-translate-y-0.5 disabled:hover:translate-y-0 " +
  "disabled:cursor-not-allowed disabled:bg-disabled disabled:text-ink-faint disabled:border-transparent disabled:shadow-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-ivory shadow-raised hover:bg-primary-dark active:bg-primary-dark",
  secondary:
    "border border-primary/50 bg-transparent text-primary hover:bg-sage-soft active:bg-sage-soft",
  ghost: "bg-transparent text-primary hover:bg-sage-soft active:bg-sage-soft",
  destructive:
    "bg-danger text-ivory shadow-raised hover:bg-danger-dark active:bg-danger-dark",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
}

export function Button({
  variant = "primary",
  full = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${full ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  full?: boolean;
}

/** A navigation link in the pill button's clothes (Step 11). */
export function ButtonLink({
  variant = "primary",
  full = false,
  className = "",
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={`${base} ${variants[variant]} ${full ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}
