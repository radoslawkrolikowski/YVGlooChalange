export function Skeleton({
  variant = "block",
  className = "",
}: {
  variant?: "block" | "text";
  className?: string;
}) {
  const shape = variant === "text" ? "h-4 rounded-sm" : "h-24 rounded-md";
  return (
    <div aria-hidden className={`animate-pulse bg-line ${shape} ${className}`} />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} variant="text" className={i === lines - 1 ? "w-2/3" : "w-full"} />
      ))}
    </div>
  );
}
