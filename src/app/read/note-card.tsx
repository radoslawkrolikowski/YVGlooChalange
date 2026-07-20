"use client";

import { ChevronDown, Lock, NotebookPen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import { Card, SectionLabel } from "@/components/ui";
import {
  loadAnonNote,
  MAX_NOTE_LENGTH,
  saveAnonNote,
} from "@/lib/anon-notes";

/*
 * Private per-passage note (Step 19A) — the reading-screen surface.
 *
 * A quiet scratch surface in the editorial register, sitting near the
 * highlights affordance below the passage: a collapsible card with one
 * autosizing textarea, an unobtrusive "Saved" indicator, and a gentle empty
 * state. No send button — a note is a working thought for yourself, never a
 * post. Clearly marked private ("Only you can see this").
 *
 * The note hangs on the passage REFERENCE, not the version, so switching the
 * version on screen keeps the same note. Path A persists through /api/notes
 * (debounced autosave); Path B keeps notes in sessionStorage only, no database
 * row. Both paths hide silently on a load/save failure — the text stays in the
 * box to retry, and reading is never blocked.
 */

const DEBOUNCE_MS = 800;

type SaveState = "idle" | "saving" | "saved";

function anonHeaders(): Record<string, string> {
  const token = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
  return token ? { "x-round-session": token } : {};
}

export function NoteCard({
  reference,
  label,
  isAnonymous,
  autoFocus = false,
}: {
  /** USFM reference of the passage the note hangs on, e.g. "PSA.23". */
  reference: string;
  /** Human-readable passage label captured with the note for the My notes list. */
  label: string | null;
  isAnonymous: boolean;
  /** Deep-linked from Profile's "My notes" — open expanded and focus. */
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(autoFocus);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loaded, setLoaded] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the passage's existing note. Path A hits /api/notes; Path B reads
  // sessionStorage. A load failure is swallowed — the card just starts empty
  // and reading goes on (the surface never blocks on it).
  useEffect(() => {
    let cancelled = false;
    setSaveState("idle");

    if (isAnonymous) {
      const existing = loadAnonNote(reference);
      setBody(existing?.body ?? "");
      setOpen(autoFocus || !!existing?.body);
      setLoaded(true);
      return;
    }

    setBody("");
    setLoaded(false);
    fetch(`/api/notes?reference=${encodeURIComponent(reference)}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) {
          const existing = data.note?.body ?? "";
          setBody(existing);
          setOpen(autoFocus || existing.length > 0);
        }
      })
      .catch(() => {
        // Stored note just doesn't load this visit; the box stays usable.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [reference, isAnonymous, autoFocus]);

  // Grow the textarea to fit its content — a single autosizing field.
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (open) resize();
  }, [open, body, loaded, resize]);

  // Focus after a deep-linked open, once the note has loaded.
  useEffect(() => {
    if (autoFocus && open && loaded) {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
  }, [autoFocus, open, loaded]);

  const persist = useCallback(
    (value: string) => {
      setSaveState("saving");
      if (isAnonymous) {
        saveAnonNote({ reference, label, body: value });
        setSaveState("saved");
        return;
      }
      fetch("/api/notes", {
        method: "PUT",
        headers: { "content-type": "application/json", ...anonHeaders() },
        body: JSON.stringify({ reference, label, body: value }),
      })
        .then((response) => response.json())
        .then((data) => {
          setSaveState(data.ok ? "saved" : "idle");
        })
        .catch(() => {
          // Silent on failure — the text stays in the box to retry on the
          // next keystroke; reading is never interrupted by a save error.
          setSaveState("idle");
        });
    },
    [isAnonymous, reference, label],
  );

  function handleChange(value: string) {
    setBody(value);
    setSaveState("idle");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(value), DEBOUNCE_MS);
  }

  // Flush a pending save on unmount so a quick navigate-away still saves.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasNote = body.trim().length > 0;

  return (
    <Card className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 text-left"
      >
        <SectionLabel icon={<NotebookPen size={14} aria-hidden />}>
          Private note
        </SectionLabel>
        <ChevronDown
          size={18}
          aria-hidden
          className={`shrink-0 text-ink-faint transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(event) => handleChange(event.target.value)}
            onInput={resize}
            maxLength={MAX_NOTE_LENGTH}
            rows={3}
            placeholder="Jot a thought for yourself…"
            aria-label="Your private note for this passage"
            className="w-full resize-none rounded-md border border-line bg-surface px-3 py-2.5 text-base leading-relaxed text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-offset-1 focus:outline-primary"
          />
          <div className="flex items-center justify-between gap-2 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1.5">
              <Lock size={12} aria-hidden />
              Only you can see this
            </span>
            <span aria-live="polite" className="min-h-4">
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : ""}
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-soft">
          {hasNote ? body : "Jot a thought for yourself — only you can see it."}
        </p>
      )}
    </Card>
  );
}
