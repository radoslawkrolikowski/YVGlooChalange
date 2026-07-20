import { Users } from "lucide-react";
import {
  ActivityRow,
  Avatar,
  ButtonLink,
  Card,
  RoundAvatar,
  SectionLabel,
} from "@/components/ui";

export interface CircleActivityItem {
  id: string;
  /** Display name of the contributing member; ignored for system items. */
  authorName: string;
  /** True for Round's own contributions (digests, prompts). */
  isSystem?: boolean;
  /** One-line published contribution text — never reading status or pace. */
  text: string;
  /** Pre-formatted relative timestamp, e.g. "2h ago". */
  timestamp: string;
}

export interface CircleSummary {
  heading: string;
  activity: CircleActivityItem[];
}

/*
 * Circle card (Step 8C): flat ivory card showing the circle's published
 * thread contributions — reflections, Round's prompts/digests, messages.
 * Never member reading status, completion, or pace (design constraint #1).
 *
 * Step 16 lights this up once the user joins a circle: the heading carries the
 * circle name and "Open Circle" links to /circles. Thread activity rows arrive
 * with the thread (Step 17); until then the activity list is empty and a short
 * line stands in. No unread counts or "new since your last visit" until a
 * later step defines the last-seen mechanism.
 */
export function CircleCard({ circle = null }: { circle?: CircleSummary | null }) {
  return (
    <Card className="flex flex-col gap-3">
      <SectionLabel icon={<Users size={14} aria-hidden />}>Circle</SectionLabel>

      {circle ? (
        <>
          <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
            {circle.heading}
          </h2>
          {circle.activity.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {circle.activity.slice(0, 3).map((item) => (
                <ActivityRow
                  key={item.id}
                  avatar={
                    item.isSystem ? (
                      <RoundAvatar size="sm" />
                    ) : (
                      <Avatar name={item.authorName} size="sm" />
                    )
                  }
                  text={item.text}
                  timestamp={item.timestamp}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              You&rsquo;re in this circle. Open it to read together.
            </p>
          )}
          <ButtonLink href="/circles" variant="secondary" full>
            Open Circle
          </ButtonLink>
        </>
      ) : (
        <>
          <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
            Your circle will gather here.
          </h2>
          <p className="text-sm text-ink-soft">
            Reading circles arrive soon — you&rsquo;ll see reflections and
            discussion prompts from your group.
          </p>
        </>
      )}
    </Card>
  );
}
