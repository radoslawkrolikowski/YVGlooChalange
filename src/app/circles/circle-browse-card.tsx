import { Badge, Button, Card } from "@/components/ui";
import type { CircleBrowseItem } from "@/lib/circles";
import { StackedAvatars } from "./stacked-avatars";

/*
 * One open circle in the browse list (Step 16): name, plan badge, member count
 * as stacked avatar chips, and the forming/active state badge — never any
 * per-member progress. `joinable` is false when the viewer is already in a
 * circle (Step 16 allows one), so the card renders read-only.
 */
export function CircleBrowseCard({
  circle,
  joinable,
  busy,
  onJoin,
}: {
  circle: CircleBrowseItem;
  joinable: boolean;
  busy: boolean;
  onJoin: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-lg font-semibold tracking-tight text-ink">
          {circle.name}
        </h3>
        <Badge status={circle.state === "active" ? "active" : "forming"}>
          {circle.state}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge status="neutral">{circle.planName}</Badge>
      </div>

      <StackedAvatars names={circle.memberNames} count={circle.memberCount} />

      {joinable && (
        <Button variant="secondary" full onClick={onJoin} disabled={busy}>
          {busy ? "Joining…" : "Join circle"}
        </Button>
      )}
    </Card>
  );
}
