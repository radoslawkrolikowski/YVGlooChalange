"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import { AgentThinking, BottomSheet, Button, SupportCard } from "@/components/ui";
import type { CrisisResource } from "@/config/crisis-resources";
import type { PrayerDraft, PrayerIntent } from "./types";

/*
 * Prayer generation sheet (Step 26) — the focused surface where a prayer is
 * written and acted on. Opened for a "daily" or "custom" generation, or to
 * "view" a saved prayer. The prayer streams in word-by-word (the tab's real
 * thinking effect) behind AgentThinking; copy / save / share enable only once
 * the stream completes. A custom prompt flagged by Escalation shows the quiet
 * support card and no prayer. Sharing recasts the prayer to name the author,
 * previews it, and posts only on explicit confirm — never automatic.
 *
 * Both session paths behave identically (Step 30A): an anonymous visitor
 * generates, copies, saves, and — inside the public demo circle — shares, with
 * every artifact scoped to their session and nothing carried past it.
 */

type Phase = "thinking" | "done" | "error" | "flagged";
type SharePhase = "idle" | "recasting" | "preview" | "sharing" | "shared";

function anonHeaders(isAnonymous: boolean): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isAnonymous) {
    const token = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
    if (token) headers["x-round-session"] = token;
  }
  return headers;
}

function attribution(intent: PrayerIntent): string {
  const mode = intent.kind === "view" ? intent.prayer.mode : intent.kind;
  return mode === "custom"
    ? "Round — a prayer at your request"
    : "Round — a prayer for today";
}

export function PrayerSheet({
  open,
  onClose,
  intent,
  isAnonymous,
  hasCircle,
  onSave,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  intent: PrayerIntent;
  /** Path B: the session token travels in a header on every call. */
  isAnonymous: boolean;
  /** There is a circle to share into — the reader's own (Path A) or the public
   * demo circle (Path B, Step 30A). Drives the Share affordance. */
  hasCircle: boolean;
  /** Persist a kept prayer — a session-scoped row on either path. */
  onSave: (draft: PrayerDraft) => Promise<boolean>;
  onToast: (message: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("thinking");
  const [text, setText] = useState("");
  const [readingReference, setReadingReference] = useState<string | null>(null);
  const [resources, setResources] = useState<CrisisResource[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharePhase, setSharePhase] = useState<SharePhase>("idle");
  const [recastText, setRecastText] = useState("");
  // A generation is tied to one open; a stale async response must not land in a
  // reopened sheet.
  const runId = useRef(0);

  const generate = useCallback(async () => {
    const id = ++runId.current;
    setPhase("thinking");
    setText("");
    setResources([]);
    const headers = anonHeaders(isAnonymous);
    // Non-streamed: the sheet shows the thinking treatment while the whole
    // prayer is written, then drops in the finished text in one update.
    const payload =
      intent.kind === "custom"
        ? { mode: "custom", prompt: intent.prompt, stream: false }
        : { mode: "daily", stream: false };

    try {
      const res = await fetch("/api/prayer/generate", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (id !== runId.current) return;
      if (body.flagged) {
        // Escalation-flagged custom prompt — show the support card, no prayer.
        setResources(body.resources ?? []);
        setPhase("flagged");
        return;
      }
      if (!res.ok || !body.ok) {
        setPhase("error");
        return;
      }
      setText((body.text ?? "").trim());
      setReadingReference(body.readingReference ?? null);
      setPhase("done");
    } catch {
      if (id === runId.current) setPhase("error");
    }
  }, [intent, isAnonymous]);

  // Start (or restart) whenever the sheet opens. Viewing a saved prayer skips
  // generation entirely.
  useEffect(() => {
    if (!open) return;
    setSaved(false);
    setSharePhase("idle");
    setRecastText("");
    if (intent.kind === "view") {
      runId.current++;
      setText(intent.prayer.body);
      setReadingReference(intent.prayer.readingReference);
      setSaved(true);
      setPhase("done");
      return;
    }
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const busy = phase === "thinking";
  const canAct = phase === "done";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      onToast("Prayer copied");
    } catch {
      onToast("Couldn't copy");
    }
  }

  async function save() {
    if (saved || saving) return;
    setSaving(true);
    const draft: PrayerDraft = {
      mode: intent.kind === "custom" ? "custom" : "daily",
      body: text,
      title:
        intent.kind === "custom"
          ? intent.prompt.slice(0, 120)
          : readingReference,
      readingReference,
      language: null,
    };
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) {
      setSaved(true);
      onToast("Prayer saved");
    } else {
      onToast("Couldn't save");
    }
  }

  async function startShare() {
    setSharePhase("recasting");
    try {
      const res = await fetch("/api/prayer/recast", {
        method: "POST",
        headers: anonHeaders(isAnonymous),
        body: JSON.stringify({ prayer: text }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setSharePhase("idle");
        onToast("Couldn't prepare the prayer");
        return;
      }
      setRecastText(body.text);
      setSharePhase("preview");
    } catch {
      setSharePhase("idle");
      onToast("Couldn't prepare the prayer");
    }
  }

  async function confirmShare() {
    setSharePhase("sharing");
    try {
      const res = await fetch("/api/prayer/share", {
        method: "POST",
        headers: anonHeaders(isAnonymous),
        body: JSON.stringify({ text: recastText }),
      });
      const body = await res.json();
      if (body.flagged) {
        setResources(body.resources ?? []);
        setPhase("flagged");
        setSharePhase("idle");
        return;
      }
      if (!res.ok || !body.ok) {
        setSharePhase("preview");
        onToast("Couldn't share the prayer");
        return;
      }
      setSharePhase("shared");
      onToast("Shared with your circle");
    } catch {
      setSharePhase("preview");
      onToast("Couldn't share the prayer");
    }
  }

  const title = intent.kind === "custom" ? "Your prayer" : "Prayer for today";

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {busy && (
        <AgentThinking
          title="Writing your prayer…"
          lines={[
            "Sitting with your reading…",
            "Gathering your reflections…",
            "Finding the words…",
          ]}
          skeletonRows={4}
        />
      )}

      {phase === "flagged" && (
        <SupportCard resources={resources} onDismiss={onClose} />
      )}

      {phase === "error" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            The prayer couldn&apos;t be written just now. Please try again.
          </p>
          <Button variant="secondary" onClick={() => void generate()}>
            Try again
          </Button>
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col gap-5">
          <PrayerText text={text} />
          <p className="text-xs italic text-ink-faint">{attribution(intent)}</p>

          {sharePhase === "preview" || sharePhase === "sharing" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-gold-soft bg-gold-soft/25 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
                Your circle will see this
              </p>
              <PrayerText text={recastText} small />
              <div className="flex gap-2">
                <Button
                  full
                  onClick={() => void confirmShare()}
                  disabled={sharePhase === "sharing"}
                >
                  {sharePhase === "sharing" ? "Sharing…" : "Share with circle"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSharePhase("idle")}
                  disabled={sharePhase === "sharing"}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void copy()} disabled={!canAct}>
                <Copy size={16} aria-hidden /> Copy
              </Button>
              <Button
                variant="secondary"
                onClick={() => void save()}
                disabled={!canAct || saved || saving}
              >
                {saved ? (
                  <>
                    <Check size={16} aria-hidden /> Saved
                  </>
                ) : (
                  "Save"
                )}
              </Button>
              {hasCircle && (
                <Button
                  onClick={() => void startShare()}
                  disabled={!canAct || sharePhase === "recasting" || sharePhase === "shared"}
                >
                  <Share2 size={16} aria-hidden />
                  {sharePhase === "recasting"
                    ? "Preparing…"
                    : sharePhase === "shared"
                      ? "Shared"
                      : "Share with circle"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

/** The prayer body, in the generous serif treatment the moment deserves. */
function PrayerText({ text, small = false }: { text: string; small?: boolean }) {
  return (
    <p
      className={`whitespace-pre-wrap font-serif leading-relaxed text-ink ${
        small ? "text-base" : "text-lg"
      }`}
    >
      {text}
    </p>
  );
}
