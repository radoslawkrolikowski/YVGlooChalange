"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-base font-semibold transition-colors " +
  "disabled:cursor-not-allowed disabled:bg-disabled disabled:text-ink-faint disabled:border-transparent " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark active:bg-primary-dark",
  secondary:
    "border border-primary bg-surface text-primary hover:bg-primary-light active:bg-primary-light",
  ghost: "bg-transparent text-primary hover:bg-primary-light active:bg-primary-light",
  destructive: "bg-danger text-white hover:bg-danger-dark active:bg-danger-dark",
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
