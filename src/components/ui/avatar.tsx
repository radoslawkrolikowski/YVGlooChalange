function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "size-7 text-xs",
    md: "size-9 text-sm",
    lg: "size-12 text-base",
  } as const;
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary-light font-semibold text-primary-dark ${sizes[size]}`}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3">
      <Avatar name={name} size="sm" />
      <span className="text-sm font-medium text-ink">{name}</span>
    </span>
  );
}
