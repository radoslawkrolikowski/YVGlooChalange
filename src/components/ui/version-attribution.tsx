/*
 * Version copyright attribution line — Step 7A.
 *
 * Rendered under any displayed Bible text (highlight snippets now; Step 13's
 * passage view reuses it). Muted but always visible and never truncated —
 * the license agreement requires the attribution in full.
 */
export function VersionAttribution({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <p className={`text-xs leading-relaxed text-ink-faint ${className}`}>
      {text}
    </p>
  );
}
