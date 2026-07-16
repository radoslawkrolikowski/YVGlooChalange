/*
 * The "Round" system avatar (Step 8C): forest circle with the white Round
 * mark. Used wherever content is attributed to Round rather than a member —
 * the home circle card now, system messages in the thread from Step 20.
 */
export function RoundAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: { wrap: "size-7", icon: 16 },
    md: { wrap: "size-9", icon: 20 },
    lg: { wrap: "size-12", icon: 26 },
  } as const;
  const { wrap, icon } = sizes[size];
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary ${wrap}`}
    >
      <svg width={icon} height={icon} viewBox="0 0 32 32" fill="none">
        <circle
          cx="16"
          cy="16"
          r="11"
          stroke="var(--color-ivory)"
          strokeWidth="3.5"
        />
        <circle cx="16" cy="16" r="4" fill="var(--color-ivory)" />
      </svg>
    </span>
  );
}
