"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, Banner } from "@/components/ui";
import type { ThreadCircle, ThreadMessage } from "@/lib/circles";

/*
 * The circle thread (Step 17): a messaging surface for one circle, styled in
 * the editorial register (serif circle-name header, ivory message surfaces on
 * parchment). Members post text; the thread refetches every 10 seconds while
 * the tab is visible, pauses when it is hidden (Page Visibility API), and
 * refetches immediately after posting (Decisions → polling). Messages render
 * chronologically with author names, relative timestamps, date separators, and
 * an own-vs-others visual split. This rendering is the base every later thread
 * feature (Steps 19–28) extends.
 */

const POLL_INTERVAL_MS = 10_000;

export function CircleThread({
  circle,
  currentUserId,
  initialMessages,
}: {
  circle: ThreadCircle;
  currentUserId: string;
  initialMessages: ThreadMessage[];
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const response = await fetch(`/api/circles/${circle.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const result = await response.json();
      if (result.ok) {
        setDraft("");
        // The POST returns the fresh thread — show it without waiting for a poll.
        setMessages(result.messages as ThreadMessage[]);
      } else {
        setError(result.error ?? "Your message could not be sent.");
      }
    } catch {
      setError("Your message could not be sent.");
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

      {messages.length === 0 ? (
        <EmptyThread state={circle.state} />
      ) : (
        <MessageList messages={messages} currentUserId={currentUserId} />
      )}

      <div ref={endRef} />

      <Composer
        draft={draft}
        sending={sending}
        onChange={setDraft}
        onKeyDown={onComposerKeyDown}
        onSend={() => void send()}
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
            <MessageRow
              message={message}
              own={message.authorId === currentUserId}
            />
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

/** The composer, pinned above the mobile bottom nav / at the column bottom. */
function Composer({
  draft,
  sending,
  onChange,
  onKeyDown,
  onSend,
}: {
  draft: string;
  sending: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
}) {
  const empty = draft.trim().length === 0;
  return (
    <div
      className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur pb-[calc(env(safe-area-inset-bottom)+4.75rem)] md:pb-4"
    >
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Write a message…"
          aria-label="Write a message"
          className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-offset-1 focus:outline-primary"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={empty || sending}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-base font-semibold text-ivory shadow-raised transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-disabled disabled:text-ink-faint disabled:shadow-none"
        >
          {sending ? "Sending…" : "Send"}
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
