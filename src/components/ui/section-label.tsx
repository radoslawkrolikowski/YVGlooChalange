/*
 * Icon-chip section label (Step 8C): a small round icon chip plus an
 * uppercase tracked label — the card register used by Home ("TODAY",
 * "CIRCLE") and Profile. Icons are passed in (typically lucide, ~14px).
 */
export function SectionLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-gold-soft text-primary"
      >
        {icon}
      </span>
      <span className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
        {children}
      </span>
    </div>
  );
}
