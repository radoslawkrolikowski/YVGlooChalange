"use client";

// Notification bell (Step 29): the header surface for the Reminder agent's
// output and, from Step 30A, for a bot reply landing on a post you wrote.
// Polls /api/notifications, shows an unread-count badge, and opens an anchored
// panel listing each notification as a card row (type icon, title, body,
// relative time, unread dot). Opening the panel marks everything read.
//
// Both session paths (Step 30A): an anonymous Instant Access session sends its
// signed token with each call and sees its own session-scoped notifications —
// the same surface, the same code, nothing persisted past the session.

import { Bell, BookOpen, MessagesSquare, Reply } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import { EmptyState } from "@/components/ui";
import type { NotificationItem } from "@/lib/notifications";

/** How often the bell re-polls while the tab is focused. */
const POLL_MS = 30_000;

/** The anonymous session token, when this is a Path B visitor. */
function anonHeaders(): Record<string, string> {
  const token = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
  return token ? { "x-round-session": token } : {};
}

interface Feed {
  items: NotificationItem[];
  unreadCount: number;
}

/** "just now" / "3h ago" / "2d ago" from an ISO timestamp. */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function TypeIcon({ type }: { type: string }) {
  const Icon =
    type === "reading" ? BookOpen : type === "reply" ? Reply : MessagesSquare;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
      <Icon size={16} aria-hidden />
    </span>
  );
}

/** A reading reminder deep-links to the reader's plan; a message reminder to the
 * circle it is about. Both fall back to Home when the target is unknown. */
function itemHref(item: NotificationItem): string {
  if (item.type === "reading") return "/read";
  if (item.circleId) return `/circles/${item.circleId}`;
  return "/home";
}

export function NotificationBell() {
  const [feed, setFeed] = useState<Feed>({ items: [], unreadCount: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", {
        cache: "no-store",
        headers: anonHeaders(),
      });
      const payload = (await response.json()) as Partial<Feed> & {
        ok?: boolean;
      };
      if (payload.ok) {
        setFeed({
          items: payload.items ?? [],
          unreadCount: payload.unreadCount ?? 0,
        });
      }
    } catch {
      // A failed poll is silent — the bell keeps its last known state.
    }
  }, []);

  // Poll on mount, on an interval, and when the tab regains focus.
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  // Close on outside pointer-down or Escape — same as the account Menu.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    // Opening marks everything read: clear the badge optimistically, then
    // persist and reconcile with the server's fresh feed.
    if (next && feed.unreadCount > 0) {
      setFeed((current) => ({ ...current, unreadCount: 0 }));
      try {
        const response = await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...anonHeaders() },
          body: JSON.stringify({ read: true }),
        });
        const payload = (await response.json()) as Partial<Feed> & {
          ok?: boolean;
        };
        if (payload.ok) {
          setFeed({
            items: payload.items ?? [],
            unreadCount: payload.unreadCount ?? 0,
          });
        }
      } catch {
        // Keep the optimistic clear; the next poll reconciles.
      }
    }
  }

  const { items, unreadCount } = feed;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        onClick={toggle}
        className="relative inline-flex items-center rounded-full p-1.5 text-ink-soft transition-colors hover:bg-sage-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Bell size={20} aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-ivory">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-line bg-surface shadow-raised"
        >
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-serif text-base font-semibold tracking-tight text-ink">
              Notifications
            </h2>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={<Bell size={22} aria-hidden />}
              heading="You're all caught up"
              subtext="Reading reminders and circle updates will appear here."
            />
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={itemHref(item)}
                    onClick={() => setOpen(false)}
                    className="flex gap-3 px-4 py-3 transition-colors hover:bg-sage-soft"
                  >
                    <TypeIcon type={item.type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-ink">
                          {item.title}
                        </p>
                        <span className="shrink-0 text-xs text-ink-faint">
                          {relativeTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-3 text-sm text-ink-soft">
                        {item.body}
                      </p>
                      {item.label && (
                        <p className="mt-1 text-xs font-medium text-primary">
                          {item.label}
                        </p>
                      )}
                    </div>
                    {!item.read && (
                      <span
                        aria-hidden
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                      />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
