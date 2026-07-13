import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "flat" | "elevated";
}

export function Card({ variant = "flat", className = "", ...props }: CardProps) {
  const look =
    variant === "elevated"
      ? "bg-surface shadow-card"
      : "bg-surface border border-line";
  return (
    <div className={`rounded-lg p-4 ${look} ${className}`} {...props} />
  );
}
