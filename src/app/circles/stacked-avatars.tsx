import { Avatar } from "@/components/ui";

/*
 * Member count as stacked avatar chips (Step 16 browse cards). Initials only —
 * a member's display name is the most a circle ever exposes about them; never
 * reading progress or pace. Caps at five avatars (the max circle size).
 */
export function StackedAvatars({
  names,
  count,
}: {
  names: string[];
  count: number;
}) {
  const shown = names.slice(0, 5);
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {shown.map((name, index) => (
          <span
            // Names can repeat; index keeps keys stable within the stack.
            key={`${name}-${index}`}
            className="rounded-full ring-2 ring-surface"
          >
            <Avatar name={name} size="sm" />
          </span>
        ))}
      </div>
      <span className="text-sm text-ink-soft">
        {count} {count === 1 ? "reader" : "readers"}
      </span>
    </div>
  );
}
