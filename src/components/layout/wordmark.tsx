/*
 * The Round wordmark: a small circle mark (two arcs suggesting a reading
 * circle) plus the name. Pure SVG + text so it inherits the brand colour
 * and never needs an asset pipeline.
 */
export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const dims = size === "lg" ? { icon: 36, text: "text-2xl" } : { icon: 24, text: "text-lg" };
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={dims.icon}
        height={dims.icon}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden
      >
        <circle cx="16" cy="16" r="13" stroke="var(--color-primary)" strokeWidth="3.5" />
        <circle cx="16" cy="16" r="5" fill="var(--color-primary)" />
      </svg>
      <span className={`font-bold tracking-tight text-primary-dark ${dims.text}`}>
        Round
      </span>
    </span>
  );
}
