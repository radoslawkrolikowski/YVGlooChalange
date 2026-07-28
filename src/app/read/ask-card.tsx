"use client";

import { ChevronDown, MessageCircleQuestion, Send } from "lucide-react";
import { useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import { AgentThinking, Banner, Button, Card, SupportCard } from "@/components/ui";
import type { CrisisResource } from "@/config/crisis-resources";

/*
 * "Ask about this passage" (Step 33A) — the reader-initiated half of the
 * commentary corpus, sitting under the passage on the reading screen.
 *
 * Collapsed by default, always: Scripture is the focus of this screen, and a
 * permanently open input box would compete with it. Expanding reveals one line
 * to type in, and the answer replaces nothing — it appears below.
 *
 * Four outcomes, four deliberately different treatments:
 *   answered     — an answer card with the source footer naming the item;
 *   no-coverage  — a calm one-liner, not an error: the corpus genuinely has
 *                  nothing for this passage, which is a fact worth stating;
 *   flagged      — the shared SupportCard, and no answer was ever generated;
 *   cap/in-flight— a friendly limit, phrased as a boundary rather than a fault.
 *
 * Answers live in this component's state only — session-scoped for both paths,
 * no history, nothing persisted. Reloading the screen clears them by design.
 */

/** Mirrors the server's MAX_QUESTION_LENGTH so the field stops before the API does. */
const MAX_QUESTION_LENGTH = 300;

type AskState =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "answered"; question: string; answer: string; attribution: string | null }
  | { kind: "no-coverage" }
  | { kind: "off-topic" }
  | { kind: "flagged"; resources: CrisisResource[] }
  | { kind: "capped" }
  | { kind: "busy" }
  | { kind: "error" };

export function AskCard({
  label,
  isAnonymous,
}: {
  /** The plan day's human label, e.g. "Psalm 23" — what the corpus maps on. */
  label: string;
  isAnonymous: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AskState>({ kind: "idle" });

  const pending = state.kind === "thinking";

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const asked = question.trim();
    if (asked.length === 0 || pending) return;

    setState({ kind: "thinking" });
    try {
      const token = isAnonymous
        ? sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY)
        : null;
      const response = await fetch("/api/passage/ask", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { "x-round-session": token } : {}),
        },
        body: JSON.stringify({ label, question: asked }),
      });
      const body = await response.json();
      if (!body.ok) {
        setState({ kind: "error" });
        return;
      }

      switch (body.status) {
        case "answered":
          setQuestion("");
          setState({
            kind: "answered",
            question: asked,
            answer: body.answer as string,
            attribution: (body.attribution as string | null) ?? null,
          });
          return;
        case "no-coverage":
          setQuestion("");
          setState({ kind: "no-coverage" });
          return;
        case "off-topic":
          setQuestion("");
          setState({ kind: "off-topic" });
          return;
        case "flagged":
          setQuestion("");
          setState({
            kind: "flagged",
            resources: body.resources as CrisisResource[],
          });
          return;
        case "cap":
          setState({ kind: "capped" });
          return;
        case "in-flight":
          setState({ kind: "busy" });
          return;
        default:
          setState({ kind: "error" });
      }
    } catch {
      setState({ kind: "error" });
    }
  }

  return (
    <Card className="border-sage/30 bg-sage-soft/30">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-sage-soft text-primary"
          >
            <MessageCircleQuestion size={13} />
          </span>
          <span className="text-sm font-semibold text-ink">
            Ask about this passage
          </span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden
          className={`shrink-0 text-ink-faint transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <form onSubmit={ask} className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">
                Your question about {label}
              </span>
              <input
                type="text"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={MAX_QUESTION_LENGTH}
                disabled={pending}
                placeholder="Why is the shepherd image used here?"
                className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-offset-1 focus:outline-primary disabled:bg-surface-soft disabled:text-ink-faint"
              />
            </label>
            <Button
              type="submit"
              disabled={pending || question.trim().length === 0}
            >
              <Send size={16} aria-hidden />
              <span className="sr-only">Ask</span>
            </Button>
          </form>

          <p className="text-xs text-ink-faint">
            Answered only from public-domain commentary on this passage — never
            from anywhere else.
          </p>

          {state.kind === "thinking" && (
            <AgentThinking
              variant="light"
              title=""
              lines={["Looking through the commentary…"]}
            />
          )}

          {state.kind === "answered" && (
            <div className="flex flex-col gap-2 rounded-md border border-line bg-ivory p-4">
              <p className="text-sm font-medium text-ink-soft">
                {state.question}
              </p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
                {state.answer}
              </p>
              {state.attribution && (
                <p className="border-t border-gold-soft pt-2 text-xs text-ink-faint">
                  {state.attribution}
                </p>
              )}
            </div>
          )}

          {state.kind === "no-coverage" && (
            <p className="rounded-md border border-line bg-ivory p-4 text-sm leading-relaxed text-ink-soft">
              No commentary in Round&rsquo;s library covers {label}, so
              there&rsquo;s nothing here to draw an answer from. Rather than
              guess, Round says so.
            </p>
          )}

          {state.kind === "off-topic" && (
            <p className="rounded-md border border-line bg-ivory p-4 text-sm leading-relaxed text-ink-soft">
              The commentary on {label} doesn&rsquo;t touch on that. Round only
              answers from what it has, so it would rather say nothing than
              invent something.
            </p>
          )}

          {state.kind === "flagged" && <SupportCard resources={state.resources} />}

          {state.kind === "capped" && (
            <p className="text-sm text-ink-soft">
              That&rsquo;s all the questions for today — the commentary will
              still be here tomorrow.
            </p>
          )}

          {state.kind === "busy" && (
            <p className="text-sm text-ink-soft">
              Still working on your last question — one at a time.
            </p>
          )}

          {state.kind === "error" && (
            <Banner tone="error">
              Your question couldn&rsquo;t be answered just now. Please try
              again.
            </Banner>
          )}
        </div>
      )}
    </Card>
  );
}
