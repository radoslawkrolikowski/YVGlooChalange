"use client";

import { Check, HandHeart, Lock, Sparkles, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ANON_TOKEN_STORAGE_KEY } from "@/app/instant-access-button";
import {
  Banner,
  Button,
  Card,
  SectionLabel,
  SupportCard,
  TextArea,
} from "@/components/ui";
import type { CrisisResource } from "@/config/crisis-resources";
import type { PrayerRequestSummary } from "@/lib/prayer-requests";

/*
 * Prayer requests (Step 35A) — the author's own surface, on the Prayer tab
 * beneath the personal prayer cards. A request is PRIVATE the moment it is
 * written; the circle sees it only through the explicit per-request "Share with
 * circle" action, which asks for confirmation first ("Your circle will see this
 * request") — the same explicit per-item consent rule the brief sets for
 * highlights, and never an automatic post.
 *
 * Every submitted request passes the Escalation Agent server-side before it is
 * stored. A flagged request is saved private to its author, shows the quiet
 * support card here, and offers no Share action at all — the server refuses it
 * too, so hiding the button is a courtesy rather than the control.
 *
 * Both session paths render this identically: a member's requests belong to
 * their user row, an Instant Access visitor's to their session (gone with it).
 */

/** The anonymous session token, when this is a Path B visitor. */
function sessionHeaders(): Record<string, string> {
  const token = sessionStorage.getItem(ANON_TOKEN_STORAGE_KEY);
  return token ? { "x-round-session": token } : {};
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/** "3 people prayed for this" — the anonymous count, never a name. */
function prayedCountLabel(count: number): string {
  if (count === 0) return "No one has prayed for this yet";
  if (count === 1) return "1 person prayed for this";
  return `${count} people prayed for this`;
}

export function PrayerRequestsCard({
  isAnonymous,
  hasCircle,
}: {
  isAnonymous: boolean;
  /** The author is in a circle (Path A) / the public circle exists (Path B),
   * so sharing has somewhere to go. */
  hasCircle: boolean;
}) {
  const [requests, setRequests] = useState<PrayerRequestSummary[]>([]);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmShareId, setConfirmShareId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Populated only when a request is flagged — shown to this author alone.
  const [supportResources, setSupportResources] = useState<CrisisResource[] | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/prayer/requests", { headers: sessionHeaders() })
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled && body.ok && Array.isArray(body.requests)) {
          setRequests(body.requests as PrayerRequestSummary[]);
        }
      })
      .catch(() => {
        // A failed load leaves the empty state; the next visit retries.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Replace one request in place after a share / answer round-trip. */
  const replace = useCallback((updated: PrayerRequestSummary) => {
    setRequests((current) =>
      current.map((entry) => (entry.id === updated.id ? updated : entry)),
    );
  }, []);

  async function submit() {
    const text = draft.trim();
    if (text.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/prayer/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify({ body: text }),
      });
      const result = await response.json();
      if (!result.ok) {
        setError(result.error ?? "Your request could not be saved.");
        return;
      }
      setDraft("");
      setRequests((current) => [result.request as PrayerRequestSummary, ...current]);
      if (result.flagged) {
        // Saved private to this author and never shareable; only they see this.
        setSupportResources(result.resources as CrisisResource[]);
      }
    } catch {
      setError("Your request could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  async function share(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/prayer/requests/${id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (!result.ok) {
        setError(result.error ?? "That request could not be shared.");
        return;
      }
      replace(result.request as PrayerRequestSummary);
      setConfirmShareId(null);
    } catch {
      setError("That request could not be shared.");
    } finally {
      setBusyId(null);
    }
  }

  async function markAnswered(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/prayer/requests/${id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (!result.ok) {
        setError(result.error ?? "That request could not be updated.");
        return;
      }
      replace(result.request as PrayerRequestSummary);
    } catch {
      setError("That request could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <SectionLabel icon={<HandHeart size={14} aria-hidden />}>
        Prayer requests
      </SectionLabel>
      <div>
        <h2 className="font-serif text-lg font-semibold tracking-tight text-ink">
          Ask your circle to pray
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Write it for yourself first — every request is private until you choose
          to share it
          {isAnonymous ? ", and yours lasts for this session only" : ""}.
        </p>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {supportResources && supportResources.length > 0 && (
        <SupportCard
          resources={supportResources}
          onDismiss={() => setSupportResources(null)}
        />
      )}

      <TextArea
        label="What would you like prayer for?"
        rows={3}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="e.g. for my mum's surgery on Thursday"
        maxLength={2000}
      />
      <Button
        variant="secondary"
        onClick={() => void submit()}
        disabled={draft.trim().length === 0 || submitting}
      >
        {submitting ? "Saving…" : "Add request"}
      </Button>

      {requests.length > 0 ? (
        <ul className="flex flex-col">
          {requests.map((entry, index) => (
            <li
              key={entry.id}
              className={`flex flex-col gap-2 py-3 ${
                index > 0 ? "border-t border-line" : ""
              }`}
            >
              <p className="whitespace-pre-wrap break-words font-serif text-[0.95rem] leading-relaxed text-ink">
                {entry.body}
              </p>

              <RequestStatusLine request={entry} />

              {/* Actions. A flagged request offers none: it stays private. */}
              {!entry.flagged && entry.status !== "answered" && (
                <div className="flex flex-wrap items-center gap-2">
                  {entry.visibility === "private" &&
                    (confirmShareId === entry.id ? (
                      <div className="flex w-full flex-col gap-2 rounded-lg border border-gold/50 bg-gold-soft/30 px-3 py-2.5">
                        <p className="text-sm text-ink-soft">
                          Your circle will see this request.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            className="px-4 py-1.5 text-sm"
                            onClick={() => void share(entry.id)}
                            disabled={busyId === entry.id}
                          >
                            {busyId === entry.id ? "Sharing…" : "Share with circle"}
                          </Button>
                          <Button
                            variant="ghost"
                            className="px-4 py-1.5 text-sm"
                            onClick={() => setConfirmShareId(null)}
                          >
                            Keep private
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        className="px-3 py-1.5 text-sm"
                        onClick={() => setConfirmShareId(entry.id)}
                        disabled={!hasCircle}
                      >
                        <Users size={14} aria-hidden /> Share with circle
                      </Button>
                    ))}

                  {confirmShareId !== entry.id && (
                    <Button
                      variant="ghost"
                      className="px-3 py-1.5 text-sm"
                      onClick={() => void markAnswered(entry.id)}
                      disabled={busyId === entry.id}
                    >
                      <Sparkles size={14} aria-hidden /> Mark as answered
                    </Button>
                  )}
                </div>
              )}

              {entry.visibility === "private" &&
                !entry.flagged &&
                !hasCircle &&
                entry.status !== "answered" && (
                  <p className="text-xs text-ink-faint">
                    Join a circle to share a request with others.
                  </p>
                )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">
          No requests yet. Anything you write here stays private until you share
          it.
        </p>
      )}
    </Card>
  );
}

/** The one line under a request: where it stands, and the anonymous count. */
function RequestStatusLine({ request }: { request: PrayerRequestSummary }) {
  if (request.status === "answered") {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 font-semibold uppercase tracking-wide text-success">
          <Check size={11} aria-hidden /> Answered
          {request.answeredAt ? ` · ${formatDate(request.answeredAt)}` : ""}
        </span>
        {request.visibility === "circle" && (
          <span>{prayedCountLabel(request.prayedCount)}</span>
        )}
      </p>
    );
  }

  if (request.flagged) {
    // Deliberately gentle and non-alarming: the author keeps their words, and
    // nothing here hints at classification or audit.
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
        <Lock size={12} aria-hidden /> Kept private — this one stays with you.
      </p>
    );
  }

  if (request.visibility === "circle") {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1 font-medium text-primary">
          <Users size={12} aria-hidden /> Shared with your circle
        </span>
        <span>{prayedCountLabel(request.prayedCount)}</span>
      </p>
    );
  }

  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
      <Lock size={12} aria-hidden /> Private — only you can see this
    </p>
  );
}
