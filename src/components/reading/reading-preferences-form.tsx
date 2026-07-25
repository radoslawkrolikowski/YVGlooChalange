"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import {
  anonNameError,
  MAX_ANON_NAME_LENGTH,
  normaliseAnonName,
} from "@/config/anon-name";
import {
  effectiveVersionId,
  findSupportedVersion,
  SUPPORTED_LANGUAGES,
  versionsForLanguage,
} from "@/config/bible-versions";
import { Badge, Banner, Button, SelectionCard, TextInput } from "@/components/ui";
import type { Session } from "@/lib/session";

/*
 * Name + language + Bible version (Step 9; the name added in Step 30A) — the
 * one form behind both the onboarding screen and the reading settings screen.
 *
 * The name field renders for anonymous sessions only, where it is REQUIRED:
 * every circle message, avatar, greeting, and prayer Round recasts uses it, so
 * a session must always have one. It ships prefilled with the assigned
 * "Reader #n" — keeping that is a valid answer, blanking it is not. A signed-in
 * user has their YouVersion display name and never sees the field.
 *
 * The version list renders instantly from SUPPORTED_VERSIONS (the config the
 * client already ships with — Decisions: config is the source of truth),
 * then /api/bible/versions validates and enriches it against the cached live
 * catalogue in the background. Unlicensed versions render disabled with a
 * "Coming soon" badge; the live list never adds choices.
 *
 * Saving posts to /api/session/preferences. Signed-in users get a users-row
 * update; anonymous sessions get a re-minted token, swapped into
 * sessionStorage here so the rest of the app picks it up transparently.
 */

const LANGUAGE_OPTIONS: { code: string; label: string; nativeLabel: string }[] =
  [
    { code: "en", label: "English", nativeLabel: "English" },
    { code: "es", label: "Spanish", nativeLabel: "Español" },
    { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  ].filter((option) => SUPPORTED_LANGUAGES.includes(option.code));

interface EnrichedVersionData {
  id: number;
  title: string;
  selectable: boolean;
}

function defaultSelection(language: string, preferredId: number | null): number {
  if (preferredId !== null) {
    const preferred = findSupportedVersion(preferredId);
    if (preferred?.language === language && preferred.licensed) {
      return preferredId;
    }
  }
  return effectiveVersionId(language, null);
}

export function ReadingPreferencesForm({
  initialLanguage,
  initialVersionId,
  initialDisplayName = null,
  submitLabel,
  onSaved,
}: {
  initialLanguage: string | null;
  initialVersionId: number | null;
  /** Anonymous sessions only: the current name, prefilling the required field.
   * Null (Path A) hides the field — a signed-in user's name is YouVersion's. */
  initialDisplayName?: string | null;
  submitLabel: string;
  onSaved: (session: Session) => void;
}) {
  const startLanguage =
    initialLanguage && SUPPORTED_LANGUAGES.includes(initialLanguage)
      ? initialLanguage
      : "en";
  const [language, setLanguage] = useState(startLanguage);
  const [versionId, setVersionId] = useState(() =>
    defaultSelection(startLanguage, initialVersionId),
  );
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  // Errors surface only after a first submit attempt or a blur — typing into a
  // prefilled field should not scold you mid-word.
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const namesSession = initialDisplayName !== null;
  const nameError = namesSession ? anonNameError(displayName) : null;

  // Live-catalogue enrichment per language: null = check in flight or not
  // started, "failed" = catalogue unreachable (curated config stands alone).
  const [enrichment, setEnrichment] = useState<
    Record<string, Map<number, EnrichedVersionData> | "failed">
  >({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (requested.current.has(language)) return;
    requested.current.add(language);
    fetch(`/api/bible/versions?language=${language}`)
      .then((response) => response.json())
      .then((body) => {
        if (!body.ok) throw new Error(body.error);
        const byId = new Map<number, EnrichedVersionData>(
          (body.versions as EnrichedVersionData[]).map((v) => [v.id, v]),
        );
        setEnrichment((current) => ({ ...current, [language]: byId }));
      })
      .catch(() => {
        requested.current.delete(language);
        setEnrichment((current) => ({ ...current, [language]: "failed" }));
      });
  }, [language]);

  const selectLanguage = useCallback(
    (code: string) => {
      setLanguage(code);
      setVersionId((current) => {
        const kept = findSupportedVersion(current);
        return kept?.language === code && kept.licensed
          ? current
          : defaultSelection(code, initialVersionId);
      });
    },
    [initialVersionId],
  );

  async function save() {
    if (nameError) {
      setNameTouched(true);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      const anonToken = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
      if (anonToken) headers["x-round-session"] = anonToken;

      const response = await fetch("/api/session/preferences", {
        method: "POST",
        headers,
        body: JSON.stringify({
          language,
          bibleVersionId: versionId,
          // Path A never sends a name — its identity is YouVersion's.
          ...(namesSession
            ? { displayName: normaliseAnonName(displayName) }
            : {}),
        }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? "Could not save");
      if (body.token) {
        sessionStorage.setItem(ANON_TOKEN_STORAGE_KEY, body.token);
      }
      onSaved(body.session as Session);
    } catch (caught) {
      setSaveError(
        caught instanceof Error ? caught.message : "Something went wrong",
      );
    } finally {
      setSaving(false);
    }
  }

  const languageEnrichment = enrichment[language];
  const versions = versionsForLanguage(language);

  return (
    <div className="flex flex-col gap-6">
      {namesSession && (
        <TextInput
          label="Your name in the circle"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          onBlur={() => setNameTouched(true)}
          maxLength={MAX_ANON_NAME_LENGTH}
          autoComplete="off"
          required
          aria-required
          error={nameTouched && nameError ? nameError : undefined}
          helper="How other readers see you, and how Round names you in a prayer. Nothing is kept after this session."
        />
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-faint">
          Language
        </legend>
        <div role="radiogroup" aria-label="Language" className="flex flex-col gap-2">
          {LANGUAGE_OPTIONS.map((option) => (
            <SelectionCard
              key={option.code}
              title={option.nativeLabel}
              subtitle={
                option.nativeLabel === option.label ? undefined : option.label
              }
              selected={language === option.code}
              onSelect={() => selectLanguage(option.code)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-faint">
          Bible version
        </legend>
        <div
          role="radiogroup"
          aria-label="Bible version"
          className="flex flex-col gap-2"
        >
          {versions.map((version) => {
            const live =
              languageEnrichment instanceof Map
                ? languageEnrichment.get(version.id)
                : undefined;
            const selectable = live ? live.selectable : version.licensed;
            return (
              <SelectionCard
                key={version.id}
                title={version.abbreviation}
                subtitle={live?.title ?? version.title}
                selected={versionId === version.id}
                disabled={!selectable}
                trailing={
                  selectable ? undefined : (
                    <Badge status="neutral">Coming soon</Badge>
                  )
                }
                onSelect={() => setVersionId(version.id)}
              />
            );
          })}
        </div>
        <p className="text-xs text-ink-faint" role="status">
          {languageEnrichment === undefined
            ? "Checking live availability…"
            : languageEnrichment === "failed"
              ? "Couldn't reach the live catalogue — showing Round's curated list."
              : "Availability verified against the live YouVersion catalogue."}
        </p>
      </fieldset>

      {saveError && <Banner tone="error">{saveError}</Banner>}

      <Button full onClick={save} disabled={saving || nameError !== null}>
        {saving ? "Saving…" : submitLabel}
      </Button>
    </div>
  );
}
