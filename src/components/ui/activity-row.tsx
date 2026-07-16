/*
 * Circle activity row (Step 8C): avatar + one-line contribution text +
 * relative timestamp. Shows only published thread contributions — never
 * member reading status or pace (design constraint #1). The avatar slot
 * takes an <Avatar> for members or <RoundAvatar> for system messages.
 */
export function ActivityRow({
  avatar,
  text,
  timestamp,
}: {
  avatar: React.ReactNode;
  text: string;
  timestamp: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {avatar}
      <p className="min-w-0 flex-1 truncate text-sm text-ink">{text}</p>
      <span className="shrink-0 text-xs text-ink-faint">{timestamp}</span>
    </div>
  );
}
