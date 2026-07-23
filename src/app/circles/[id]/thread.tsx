"use client";

import { CornerDownRight, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarChip, Banner, RoundAvatar, SupportCard } from "@/components/ui";
import type { CirclePlanDay, ThreadCircle, ThreadMessage } from "@/lib/circles";
import type { CrisisResource } from "@/config/crisis-resources";

/*
 * The circle thread (Step 17; extended in Step 19): a messaging surface for one
 * circle, styled in the editorial register (serif circle-name header, ivory
 * message surfaces on parchment). Members post text; the thread refetches every
 * 10 seconds while the tab is visible, pauses when it is hidden (Page
 * Visibility API), and refetches immediately after posting (Decisions →
 * polling). Messages render chronologically with author names, relative
 * timestamps, date separators, and an own-vs-others visual split.
 *
 * Step 19 adds reflections. Finishing a plan day (?reflect=<dayNumber>) primes
 * the SAME composer for reflection mode: the day's reference shown above it and
 * a reflection prompt in place of the ordinary placeholder. Submitting routes
 * the text through the Escalation gate server-side; an unflagged reflection
 * posts as a distinct day-tagged reflection card and the composer reverts to
 * chat, while a flagged one is never posted — the author privately sees the
 * quiet SupportCard instead, and other members' threads show no trace of it.
 *
 * Step 20 adds Round's system-message identity, defined here and reused by the
 * icebreaker (22), digest (24), and summary (25): a sage-tinted full-width card
 * with the Round mark in place of a member avatar and "Round" as the author, so
 * it can never be mistaken for a member's message. Its first use is the
 * conversation-starter card, whose questions each carry a Reply action that
 * primes the composer with that question as visible context.
 */

const POLL_INTERVAL_MS = 10_000;

type ComposerMode = "message" | "reflection";

export function CircleThread({
  circle,
  currentUserId,
  initialMessages,
  reflectionDay,
  alreadyReflected = false,
}: {
  circle: ThreadCircle;
  currentUserId: string;
  initialMessages: ThreadMessage[];
  /** Set when arriving from "Finished reading" — primes reflection mode. */
  reflectionDay: CirclePlanDay | null;
  /** This member already reflected on that day — allowed, but said out loud. */
  alreadyReflected?: boolean;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ComposerMode>(
    reflectionDay ? "reflection" : "message",
  );
  // Populated only when a reflection is flagged — shown to this author alone.
  const [supportResources, setSupportResources] = useState<
    CrisisResource[] | null
  >(null);
  // The starter question the member tapped "Reply" on (Step 20). Composer-side
  // context only: it is shown while typing and cleared on send — the posted
  // message is an ordinary message and the author's words are untouched.
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastMessageIdRef = useRef<string | undefined>(
    initialMessages.at(-1)?.id,
  );

  const fetchMessages = useCallback(async () => {
    try {
      const response = await fetch(`/api/circles/${circle.id}/messages`);
      const body = await response.json();
      if (body.ok) setMessages(body.messages as ThreadMessage[]);
    } catch {
      // A dropped poll is harmless — the next interval retries.
    }
  }, [circle.id]);

  // Poll every 10s while visible; pause when the tab is hidden, resume (with an
  // immediate fetch) when it returns to the foreground.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      void fetchMessages();
      timer = setInterval(() => void fetchMessages(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchMessages]);

  // Auto-scroll to the newest message when the thread grows.
  useEffect(() => {
    const newest = messages.at(-1)?.id;
    if (newest && newest !== lastMessageIdRef.current) {
      lastMessageIdRef.current = newest;
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  async function send() {
    const text = draft.trim();
    if (text.length === 0 || sending) return;
    setSending(true);
    setError(null);

    // Ordinary message (Step 17): straight to the thread.
    if (mode === "message" || !reflectionDay) {
      try {
        const response = await fetch(`/api/circles/${circle.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
        const result = await response.json();
        if (result.ok) {
          setDraft("");
          setReplyTo(null);
          setMessages(result.messages as ThreadMessage[]);
        } else {
          setError(result.error ?? "Your message could not be sent.");
        }
      } catch {
        setError("Your message could not be sent.");
      } finally {
        setSending(false);
      }
      return;
    }

    // Reflection (Step 19): the Escalation gate runs server-side before this
    // is stored or posted. A flag never reaches the thread — the author sees
    // the support card; an unflagged reflection posts and the composer reverts.
    try {
      const response = await fetch(`/api/circles/${circle.id}/reflections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, dayNumber: reflectionDay.dayNumber }),
      });
      const result = await response.json();
      if (!result.ok) {
        setError(result.error ?? "Your reflection could not be sent.");
        return;
      }
      setDraft("");
      setMode("message");
      if (result.flagged) {
        // Nothing is added to the thread; only this author sees the card.
        setSupportResources(result.resources as CrisisResource[]);
      } else {
        setMessages(result.messages as ThreadMessage[]);
      }
    } catch {
      setError("Your reflection could not be sent.");
    } finally {
      setSending(false);
    }
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter sends; plain Enter keeps its newline for longer thoughts.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void send();
    }
  }

  const inReflectionMode = mode === "reflection" && reflectionDay !== null;

  /** Reply to one of Round's starter questions: leave reflection mode, show
   * the question above the composer, and put the cursor in the box. */
  function replyToQuestion(question: string) {
    setMode("message");
    setReplyTo(question);
    composerRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header: back to the circles list + the serif circle name. */}
      <div className="flex flex-col gap-1">
        <Link
          href="/circles"
          className="text-sm font-medium text-primary hover:underline"
        >
          ← Circles
        </Link>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
          {circle.name}
        </h1>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {supportResources && supportResources.length > 0 && (
        <SupportCard
          resources={supportResources}
          onDismiss={() => setSupportResources(null)}
        />
      )}

      {messages.length === 0 ? (
        <EmptyThread state={circle.state} />
      ) : (
        <MessageList
          messages={messages}
          currentUserId={currentUserId}
          onReplyToQuestion={replyToQuestion}
        />
      )}

      <div ref={endRef} />

      <Composer
        textareaRef={composerRef}
        draft={draft}
        sending={sending}
        reflectionMode={inReflectionMode}
        reflectionDay={reflectionDay}
        alreadyReflected={alreadyReflected}
        replyTo={replyTo}
        onChange={setDraft}
        onKeyDown={onComposerKeyDown}
        onSend={() => void send()}
        onSwitchToMessage={() => setMode("message")}
        onClearReply={() => setReplyTo(null)}
      />
    </div>
  );
}

/**
 * The waiting state before the circle activates. A forming circle (one reader
 * so far) shows a designed "waiting for 1 more reader" state, not a blank
 * thread and — per brief §5.2 — not a "say hi" prompt: when a second reader
 * joins, Round opens the conversation itself with the cold-start icebreaker
 * (Step 22), so the first thing this thread ever shows is that welcome. The
 * "no messages" branch is only a graceful fallback should an active circle's
 * icebreaker generation have failed.
 */
function EmptyThread({ state }: { state: ThreadCircle["state"] }) {
  const forming = state === "forming";
  return (
    <div className="rounded-lg border border-line bg-surface px-6 py-10 text-center">
      <p className="font-serif text-lg font-semibold text-ink">
        {forming ? "Waiting for 1 more reader" : "No messages yet."}
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {forming
          ? "Your circle opens when a second reader joins — Round will start the conversation for you both."
          : "Say something to open the conversation — a thought, a greeting, a question from today’s reading."}
      </p>
    </div>
  );
}

/** Chronological messages with date separators and own-vs-others layout. */
function MessageList({
  messages,
  currentUserId,
  onReplyToQuestion,
}: {
  messages: ThreadMessage[];
  currentUserId: string;
  onReplyToQuestion: (question: string) => void;
}) {
  let lastDayKey: string | null = null;

  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => {
        const dayKey = dateKey(message.createdAt);
        const showSeparator = dayKey !== lastDayKey;
        lastDayKey = dayKey;
        return (
          <div key={message.id} className="flex flex-col gap-3">
            {showSeparator && <DateSeparator iso={message.createdAt} />}
            {message.kind === "icebreaker" ? (
              <IcebreakerRow message={message} />
            ) : message.kind === "digest" ? (
              <DigestRow message={message} />
            ) : message.kind === "starters" ? (
              <StartersRow message={message} onReply={onReplyToQuestion} />
            ) : message.kind === "reflection" ? (
              <ReflectionRow
                message={message}
                own={message.authorId === currentUserId}
              />
            ) : (
              <MessageRow
                message={message}
                own={message.authorId === currentUserId}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DateSeparator({ iso }: { iso: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-line" />
      <span
        suppressHydrationWarning
        className="text-xs font-semibold uppercase tracking-widest text-ink-faint"
      >
        {formatDay(iso)}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function MessageRow({ message, own }: { message: ThreadMessage; own: boolean }) {
  if (own) {
    // Own messages align right with no avatar — the reader knows who they are.
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] rounded-lg rounded-br-sm bg-primary-light px-3.5 py-2.5 text-ink">
          <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed">
            {message.body}
          </p>
        </div>
        <span suppressHydrationWarning className="px-1 text-xs text-ink-faint">
          {formatTime(message.createdAt)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <Avatar name={message.authorName} size="sm" />
      <div className="flex min-w-0 max-w-[85%] flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-ink">
            {message.authorName}
          </span>
          <span
            suppressHydrationWarning
            className="shrink-0 text-xs text-ink-faint"
          >
            {formatTime(message.createdAt)}
          </span>
        </div>
        <div className="rounded-lg rounded-tl-sm border border-line bg-surface px-3.5 py-2.5">
          <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed text-ink">
            {message.body}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * A reflection (Step 19): a day-tagged card, visually distinct from ordinary
 * messages — a gold-hairline surface with a "Reflection · <day>" tag, so it
 * reads as an intentional daily contribution rather than a passing message.
 * Full-width (not the own/other bubble split) because a reflection is a
 * considered post, and its author is always named.
 */
function ReflectionRow({
  message,
  own,
}: {
  message: ThreadMessage;
  own: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Avatar name={message.authorName} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-ink">
            {own ? "You" : message.authorName}
          </span>
          <span
            suppressHydrationWarning
            className="shrink-0 text-xs text-ink-faint"
          >
            {formatTime(message.createdAt)}
          </span>
        </div>
        <div className="rounded-lg border border-gold/50 bg-gold-soft/25 px-3.5 py-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
            Reflection{message.dayLabel ? ` · ${message.dayLabel}` : ""}
          </p>
          <p className="whitespace-pre-wrap break-words font-serif text-[0.98rem] leading-relaxed text-ink">
            {message.body}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Round's system-message identity (Step 20) — the shared frame every
 * system-attributed post uses, reused by Steps 22, 24 and 25. Three signals
 * separate it from a member message at a glance: the Round mark instead of an
 * initials avatar, "Round" as the author with a small system tag, and a
 * sage-tinted full-width surface rather than the ivory member bubble.
 */
function SystemMessage({
  createdAt,
  label,
  children,
}: {
  createdAt: string;
  /** Small line under the name, e.g. the passage the post responds to. */
  label?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <RoundAvatar size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-ink">Round</span>
          {/* Names what Round is, so the post can never read as a member.
              Deliberately not "Facilitator": that is the name of a specific
              agent (Step 24's digest), and this identity is shared by several. */}
          <span className="shrink-0 rounded-full bg-sage-soft px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-widest text-primary">
            Round AI
          </span>
          <span
            suppressHydrationWarning
            className="shrink-0 text-xs text-ink-faint"
          >
            {formatTime(createdAt)}
          </span>
        </div>
        <div className="rounded-lg rounded-tl-sm border border-sage/60 bg-sage-soft/60 px-3.5 py-3">
          {label && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
              {label}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The conversation-starter card (Step 20): 2–3 questions from Round, each on
 * its own line with its own Reply action so a member can answer one question
 * rather than the card as a whole.
 */
function StartersRow({
  message,
  onReply,
}: {
  message: ThreadMessage;
  onReply: (question: string) => void;
}) {
  const questions = message.questions ?? [];
  return (
    <SystemMessage
      createdAt={message.createdAt}
      label={`Conversation starters${message.dayLabel ? ` · ${message.dayLabel}` : ""}`}
    >
      <ol className="flex flex-col gap-2.5">
        {questions.map((question, index) => (
          <li
            key={question}
            className="flex flex-col gap-1.5 border-t border-sage/40 pt-2.5 first:border-t-0 first:pt-0"
          >
            <p className="flex gap-2 font-serif text-[0.98rem] leading-relaxed text-ink">
              <span aria-hidden className="shrink-0 font-semibold text-primary">
                {index + 1}.
              </span>
              <span className="break-words">{question}</span>
            </p>
            <button
              type="button"
              onClick={() => onReply(question)}
              className="inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-sage-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <CornerDownRight size={13} aria-hidden />
              Reply to this
            </button>
          </li>
        ))}
      </ol>
    </SystemMessage>
  );
}

/**
 * The cold-start icebreaker (Step 22): the very first message in every new
 * circle, posted by Round when the circle reaches two members. It references
 * something specific from both members' onboarding answers, so it renders as
 * warm prose through the shared system-message frame — same Round identity as
 * the starters and (later) the digest, never mistakable for a member message.
 */
function IcebreakerRow({ message }: { message: ThreadMessage }) {
  return (
    <SystemMessage createdAt={message.createdAt} label="Welcome to your circle">
      <p className="whitespace-pre-wrap break-words font-serif text-[0.98rem] leading-relaxed text-ink">
        {message.body}
      </p>
    </SystemMessage>
  );
}

/**
 * The daily digest (Step 24): the thread's daily centrepiece. Round reads the
 * day's reflections and posts a distinguished card through the shared
 * system-message frame — the synthesis as readable prose, an overlap callout
 * highlighted with the named members' avatar chips, and one discussion question
 * set apart as a quote-style block inviting replies. A digest fires only when
 * enough members reflected, so it always has real words to synthesise.
 */
function DigestRow({ message }: { message: ThreadMessage }) {
  const digest = message.digest;
  // Fallback: if the structured row ever went missing, show the body prose so
  // the post is never blank.
  if (!digest) {
    return (
      <SystemMessage
        createdAt={message.createdAt}
        label={`Daily digest${message.dayLabel ? ` · ${message.dayLabel}` : ""}`}
      >
        <p className="whitespace-pre-wrap break-words font-serif text-[0.98rem] leading-relaxed text-ink">
          {message.body}
        </p>
      </SystemMessage>
    );
  }
  return (
    <SystemMessage
      createdAt={message.createdAt}
      label={`Daily digest${message.dayLabel ? ` · ${message.dayLabel}` : ""}`}
    >
      <div className="flex flex-col gap-3">
        <p className="whitespace-pre-wrap break-words font-serif text-[0.98rem] leading-relaxed text-ink">
          {digest.synthesis}
        </p>

        {digest.overlapMembers.length > 0 && digest.overlapTheme && (
          <div className="rounded-lg border border-gold/50 bg-gold-soft/30 px-3 py-2.5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
              Shared ground
            </p>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {digest.overlapMembers.map((name) => (
                <AvatarChip key={name} name={name} />
              ))}
            </div>
            <p className="break-words text-sm leading-relaxed text-ink-soft">
              landed on the same thread — {digest.overlapTheme}
            </p>
          </div>
        )}

        <blockquote className="border-l-2 border-primary/60 pl-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">
            Discussion question
          </p>
          <p className="break-words font-serif text-[0.98rem] italic leading-relaxed text-ink">
            {digest.question}
          </p>
        </blockquote>
      </div>
    </SystemMessage>
  );
}

/** The composer, pinned above the mobile bottom nav / at the column bottom.
 * In reflection mode (Step 19) it shows the day's reference above the box and a
 * reflection prompt, and offers a quiet way back to ordinary chat. */
function Composer({
  textareaRef,
  draft,
  sending,
  reflectionMode,
  reflectionDay,
  alreadyReflected,
  replyTo,
  onChange,
  onKeyDown,
  onSend,
  onSwitchToMessage,
  onClearReply,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  draft: string;
  sending: boolean;
  reflectionMode: boolean;
  reflectionDay: CirclePlanDay | null;
  alreadyReflected: boolean;
  /** Round's starter question being answered, shown while typing (Step 20). */
  replyTo: string | null;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onSwitchToMessage: () => void;
  onClearReply: () => void;
}) {
  const empty = draft.trim().length === 0;
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur pb-[calc(env(safe-area-inset-bottom)+4.75rem)] md:pb-4">
      {replyTo && !reflectionMode && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-sage/60 bg-sage-soft/60 px-3 py-2">
          <CornerDownRight
            size={14}
            aria-hidden
            className="mt-0.5 shrink-0 text-primary"
          />
          <p className="min-w-0 flex-1 text-sm text-ink-soft">
            <span className="font-semibold text-ink">Replying to Round: </span>
            {replyTo}
          </p>
          <button
            type="button"
            onClick={onClearReply}
            aria-label="Stop replying to this question"
            className="shrink-0 rounded-full p-1 text-ink-faint transition-colors hover:bg-sage-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
      {reflectionMode && reflectionDay && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="min-w-0 text-sm text-ink-soft">
            <span className="font-semibold text-ink">
              Reflecting on {reflectionDay.label}
            </span>{" "}
            {alreadyReflected
              ? "— you've already shared one on this passage; this adds another."
              : "— share what today's passage stirred in you."}
          </p>
          <button
            type="button"
            onClick={onSwitchToMessage}
            className="shrink-0 text-xs font-medium text-ink-faint underline-offset-4 transition-colors hover:text-ink-soft hover:underline"
          >
            Just chat instead
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={reflectionMode || replyTo ? 3 : 1}
          placeholder={
            reflectionMode
              ? "Share your reflection on today's passage…"
              : replyTo
                ? "Answer Round's question…"
                : "Write a message…"
          }
          aria-label={reflectionMode ? "Write your reflection" : "Write a message"}
          className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-offset-1 focus:outline-primary"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={empty || sending}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-base font-semibold text-ivory shadow-raised transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-disabled disabled:text-ink-faint disabled:shadow-none"
        >
          {sending
            ? reflectionMode
              ? "Sharing…"
              : "Sending…"
            : reflectionMode
              ? "Share"
              : "Send"}
        </button>
      </div>
    </div>
  );
}

// --- Time formatting (client-local) ---------------------------------------

function dateKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dateKey(iso) === dateKey(today.toISOString())) return "Today";
  if (dateKey(iso) === dateKey(yesterday.toISOString())) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
