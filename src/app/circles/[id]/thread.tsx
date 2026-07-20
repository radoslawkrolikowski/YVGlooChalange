"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, Banner, SupportCard } from "@/components/ui";
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
 */

const POLL_INTERVAL_MS = 10_000;

type ComposerMode = "message" | "reflection";

export function CircleThread({
  circle,
  currentUserId,
  initialMessages,
  reflectionDay,
}: {
  circle: ThreadCircle;
  currentUserId: string;
  initialMessages: ThreadMessage[];
  /** Set when arriving from "Finished reading" — primes reflection mode. */
  reflectionDay: CirclePlanDay | null;
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
        <MessageList messages={messages} currentUserId={currentUserId} />
      )}

      <div ref={endRef} />

      <Composer
        draft={draft}
        sending={sending}
        reflectionMode={inReflectionMode}
        reflectionDay={reflectionDay}
        onChange={setDraft}
        onKeyDown={onComposerKeyDown}
        onSend={() => void send()}
        onSwitchToMessage={() => setMode("message")}
      />
    </div>
  );
}

/** The empty state before the first message is posted. */
function EmptyThread({ state }: { state: ThreadCircle["state"] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-6 py-10 text-center">
      <p className="font-serif text-lg font-semibold text-ink">
        {state === "forming"
          ? "Waiting for one more reader to begin."
          : "No messages yet."}
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        Say something to open the conversation — a thought, a greeting, a
        question from today&rsquo;s reading.
      </p>
    </div>
  );
}

/** Chronological messages with date separators and own-vs-others layout. */
function MessageList({
  messages,
  currentUserId,
}: {
  messages: ThreadMessage[];
  currentUserId: string;
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
            {message.kind === "reflection" ? (
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

/** The composer, pinned above the mobile bottom nav / at the column bottom.
 * In reflection mode (Step 19) it shows the day's reference above the box and a
 * reflection prompt, and offers a quiet way back to ordinary chat. */
function Composer({
  draft,
  sending,
  reflectionMode,
  reflectionDay,
  onChange,
  onKeyDown,
  onSend,
  onSwitchToMessage,
}: {
  draft: string;
  sending: boolean;
  reflectionMode: boolean;
  reflectionDay: CirclePlanDay | null;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onSwitchToMessage: () => void;
}) {
  const empty = draft.trim().length === 0;
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur pb-[calc(env(safe-area-inset-bottom)+4.75rem)] md:pb-4">
      {reflectionMode && reflectionDay && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="min-w-0 text-sm text-ink-soft">
            <span className="font-semibold text-ink">
              Reflecting on {reflectionDay.label}
            </span>{" "}
            — share what today&rsquo;s passage stirred in you.
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
          value={draft}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={reflectionMode ? 3 : 1}
          placeholder={
            reflectionMode
              ? "Share your reflection on today's passage…"
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
