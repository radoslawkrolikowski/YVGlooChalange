import { HeartHandshake } from "lucide-react";
import Link from "next/link";
import { Card, Divider, SectionLabel } from "@/components/ui";
import {
  CIRCLE_HOPE_OPTIONS,
  FAMILIARITY_OPTIONS,
  LIFE_SEASON_OPTIONS,
  MOTIVATION_OPTIONS,
  optionLabel,
  type ProfileAnswers,
  TOPIC_OPTIONS,
} from "@/config/profile";

/*
 * "About you" card (Step 10): the onboarding answers on the profile screen,
 * verbatim, with Change linking to the profile settings screen — the same
 * row-plus-Change pattern as the reading settings card. `isDefaults` marks a
 * Path B session that skipped the questions ("(default)" annotation).
 */
export function AboutYouCard({
  answers,
  isDefaults,
}: {
  answers: ProfileAnswers;
  isDefaults: boolean;
}) {
  const topicLabels = answers.topics
    .map((topic) => optionLabel(TOPIC_OPTIONS, topic))
    .filter((label): label is string => label !== null);
  if (answers.topicsOther) topicLabels.push(answers.topicsOther);

  const hopeLabels = answers.circleHopes
    .map((hope) => optionLabel(CIRCLE_HOPE_OPTIONS, hope))
    .filter((label): label is string => label !== null);

  const rows: { label: string; value: string | null }[] = [
    { label: "What you want to learn", value: answers.goals || null },
    {
      label: "Why you're reading",
      value: optionLabel(MOTIVATION_OPTIONS, answers.motivation),
    },
    {
      label: "Bible familiarity",
      value: optionLabel(FAMILIARITY_OPTIONS, answers.bibleFamiliarity),
    },
    {
      label: "Life season",
      value: optionLabel(LIFE_SEASON_OPTIONS, answers.lifeSeason),
    },
    {
      label: "Time per day",
      value:
        answers.timePerDayMinutes === null
          ? null
          : `${answers.timePerDayMinutes} minutes`,
    },
    {
      label: "Topics",
      value: topicLabels.length > 0 ? topicLabels.join(", ") : "General",
    },
    {
      label: "Hopes for your circle",
      value: hopeLabels.length > 0 ? hopeLabels.join(", ") : null,
    },
  ];

  return (
    <Card className="flex flex-col gap-3">
      <SectionLabel icon={<HeartHandshake size={14} aria-hidden />}>
        About you
      </SectionLabel>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
          Your answers
        </h2>
        <Link
          href="/settings/profile"
          className="shrink-0 rounded-full border border-primary/50 px-3 py-1 text-sm font-medium text-primary transition-colors hover:bg-sage-soft"
        >
          Change
        </Link>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div key={row.label} className="flex flex-col gap-3">
            {index > 0 && <Divider />}
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">
                {row.label}
              </p>
              <p className="text-sm font-medium text-ink">
                {row.value ? (
                  <>
                    {row.value}{" "}
                    {isDefaults && (
                      <span className="font-normal text-ink-faint">
                        (default)
                      </span>
                    )}
                  </>
                ) : (
                  <span className="font-normal text-ink-faint">
                    Not answered yet
                  </span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
