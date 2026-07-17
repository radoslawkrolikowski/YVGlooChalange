"use client";

import { useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import {
  Banner,
  Button,
  ChoiceChips,
  MultiChoiceChips,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  CIRCLE_HOPE_OPTIONS,
  FAMILIARITY_OPTIONS,
  LIFE_SEASON_OPTIONS,
  MOTIVATION_OPTIONS,
  type ProfileAnswers,
  TIME_PER_DAY_OPTIONS,
  TOPIC_OPTIONS,
} from "@/config/profile";

/*
 * The one set of profile question fields behind both onboarding (Step 10,
 * which pages through the sections) and the profile settings screen (which
 * shows them all at once with an inline success banner) — same components,
 * so onboarding and profile feel like one system.
 */

interface SectionProps {
  answers: ProfileAnswers;
  onChange: (patch: Partial<ProfileAnswers>) => void;
}

function QuestionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children}
    </div>
  );
}

/** Questions 1–2: free-text goals and motivation. */
export function GoalsSection({ answers, onChange }: SectionProps) {
  return (
    <div className="flex flex-col gap-5">
      <TextArea
        label="What do you want to learn?"
        helper="In your own words — this shapes the reading plan Round builds for you."
        placeholder="e.g. How to forgive people who hurt me"
        value={answers.goals}
        maxLength={500}
        onChange={(event) => onChange({ goals: event.target.value })}
      />
      <QuestionBlock title="Why do you want to read the Bible?">
        <ChoiceChips
          label="Why do you want to read the Bible?"
          options={MOTIVATION_OPTIONS}
          value={answers.motivation}
          onChange={(motivation) => onChange({ motivation })}
        />
      </QuestionBlock>
    </div>
  );
}

/** Questions 3–5: familiarity, life season, time per day. */
export function JourneySection({ answers, onChange }: SectionProps) {
  return (
    <div className="flex flex-col gap-5">
      <QuestionBlock title="How familiar are you with the Bible?">
        <ChoiceChips
          label="How familiar are you with the Bible?"
          options={FAMILIARITY_OPTIONS}
          value={answers.bibleFamiliarity}
          onChange={(bibleFamiliarity) => onChange({ bibleFamiliarity })}
        />
      </QuestionBlock>
      <QuestionBlock title="What season of life are you in?">
        <ChoiceChips
          label="What season of life are you in?"
          options={LIFE_SEASON_OPTIONS}
          value={answers.lifeSeason}
          onChange={(lifeSeason) => onChange({ lifeSeason })}
        />
      </QuestionBlock>
      <QuestionBlock title="How much time can you read each day?">
        <ChoiceChips
          label="How much time can you read each day?"
          options={TIME_PER_DAY_OPTIONS.map((minutes) => ({
            value: minutes,
            label: `${minutes} minutes`,
          }))}
          value={answers.timePerDayMinutes}
          onChange={(timePerDayMinutes) => onChange({ timePerDayMinutes })}
        />
      </QuestionBlock>
    </div>
  );
}

/** Questions 6–7: topics and circle hopes. */
export function TopicsSection({ answers, onChange }: SectionProps) {
  return (
    <div className="flex flex-col gap-5">
      <QuestionBlock title="Which topics draw you in?">
        <MultiChoiceChips
          label="Which topics draw you in?"
          options={TOPIC_OPTIONS}
          values={answers.topics}
          onChange={(topics) => onChange({ topics })}
        />
        <TextInput
          label="Something else?"
          placeholder="Add your own topic"
          value={answers.topicsOther}
          maxLength={100}
          onChange={(event) => onChange({ topicsOther: event.target.value })}
        />
      </QuestionBlock>
      <QuestionBlock title="What are you hoping for from your circle?">
        <MultiChoiceChips
          label="What are you hoping for from your circle?"
          options={CIRCLE_HOPE_OPTIONS}
          values={answers.circleHopes}
          onChange={(circleHopes) => onChange({ circleHopes })}
        />
      </QuestionBlock>
    </div>
  );
}

/**
 * Persists the answers via /api/session/profile. Path B responses carry a
 * replacement signed token, swapped into sessionStorage here — the same
 * pattern as ReadingPreferencesForm.
 */
export async function saveProfileAnswers(
  answers: ProfileAnswers,
): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const anonToken = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
  if (anonToken) headers["x-round-session"] = anonToken;

  const response = await fetch("/api/session/profile", {
    method: "POST",
    headers,
    body: JSON.stringify(answers),
  });
  const body = await response.json();
  if (!body.ok) throw new Error(body.error ?? "Could not save your answers");
  if (body.token) {
    sessionStorage.setItem(ANON_TOKEN_STORAGE_KEY, body.token);
  }
}

/** All sections at once with save — the profile settings composition. */
export function ProfileQuestionsForm({
  initialAnswers,
  onSaved,
}: {
  initialAnswers: ProfileAnswers;
  onSaved?: () => void;
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(update: Partial<ProfileAnswers>) {
    setSaved(false);
    setAnswers((current) => ({ ...current, ...update }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveProfileAnswers(answers);
      setSaved(true);
      onSaved?.();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <GoalsSection answers={answers} onChange={patch} />
      <JourneySection answers={answers} onChange={patch} />
      <TopicsSection answers={answers} onChange={patch} />
      {error && <Banner tone="error">{error}</Banner>}
      {saved && <Banner tone="success">Your answers are saved.</Banner>}
      <Button full onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
