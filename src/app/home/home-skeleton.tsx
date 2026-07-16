/*
 * Home loading state (Step 8C): skeleton greeting plus two skeleton cards
 * mirroring the greeting → Today card → Circle card composition, on the
 * same pulse/line tokens as the library Skeleton.
 */
export function HomeSkeleton() {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-4 w-32 rounded-sm bg-line" />
        <div className="h-7 w-44 rounded-sm bg-line" />
      </div>
      <div className="h-52 rounded-lg bg-line" />
      <div className="h-36 rounded-lg bg-line" />
    </div>
  );
}
