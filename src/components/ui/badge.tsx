export type BadgeStatus = "forming" | "active" | "stalled" | "neutral";

const styles: Record<BadgeStatus, string> = {
  forming: "bg-info-soft text-primary-dark",
  active: "bg-success-soft text-success",
  stalled: "bg-warning-soft text-warning",
  neutral: "bg-surface-soft text-ink-soft",
};

export function Badge({
  status = "neutral",
  children,
}: {
  status?: BadgeStatus;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      {children}
    </span>
  );
}
