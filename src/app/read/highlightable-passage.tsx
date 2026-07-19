"use client";

import { Highlighter } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/*
 * The passage body with in-app highlighting (Step 14). Renders the plain-text
 * YouVersion content as reading paragraphs, washes stored highlights in the
 * highlight token, and shows a small floating "Highlight" toolbar whenever
 * the reader selects text inside the passage. Presentational: what gets
 * stored, and where, is the parent's business (ReadScreen handles both
 * session paths).
 *
 * Highlights arrive as the stored text strings for the version currently on
 * display — a highlight made in NVI never washes RVES text, because the same
 * phrase is a different string in a different translation, and the parent
 * filters by version ID anyway.
 */

/** Merged [start, end) match ranges of every highlight text in a paragraph. */
function markRanges(paragraph: string, texts: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const stored of texts) {
    // A selection spanning paragraphs is stored with newlines; each piece
    // is matched inside its own paragraph.
    for (const piece of stored.split(/\n+/)) {
      const needle = piece.trim();
      if (needle.length === 0) continue;
      let from = 0;
      let at = paragraph.indexOf(needle, from);
      while (at !== -1) {
        ranges.push([at, at + needle.length]);
        from = at + needle.length;
        at = paragraph.indexOf(needle, from);
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }
  return merged;
}

function MarkedParagraph({
  text,
  highlightTexts,
}: {
  text: string;
  highlightTexts: string[];
}) {
  const ranges = markRanges(text, highlightTexts);
  if (ranges.length === 0) return <p>{text}</p>;

  const segments: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], index) => {
    if (start > cursor) segments.push(text.slice(cursor, start));
    segments.push(
      <mark key={index} className="rounded-sm bg-highlight text-ink">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) segments.push(text.slice(cursor));
  return <p>{segments}</p>;
}

interface ToolbarState {
  /** Position relative to the passage container. */
  top: number;
  left: number;
  text: string;
}

export function HighlightablePassage({
  content,
  highlightTexts,
  onHighlight,
}: {
  /** Plain-text passage content from the Passages API. */
  content: string;
  /** Stored highlight texts for the version currently displayed. */
  highlightTexts: string[];
  onHighlight: (text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);

  const syncToolbarToSelection = useCallback(() => {
    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.isCollapsed) {
      setToolbar(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setToolbar(null);
      return;
    }
    const text = selection.toString().trim();
    if (text.length === 0) {
      setToolbar(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const host = container.getBoundingClientRect();
    setToolbar({
      top: rect.top - host.top - 44,
      left: Math.min(
        Math.max(rect.left - host.left + rect.width / 2, 64),
        host.width - 64,
      ),
      text,
    });
  }, []);

  // selectionchange covers mouse drags, keyboard selection, and the mobile
  // selection handles alike — the one signal that always fires.
  useEffect(() => {
    document.addEventListener("selectionchange", syncToolbarToSelection);
    return () =>
      document.removeEventListener("selectionchange", syncToolbarToSelection);
  }, [syncToolbarToSelection]);

  const paragraphs = content
    .split(/\n+/)
    .filter((paragraph) => paragraph.trim().length > 0);

  return (
    <div ref={containerRef} className="relative">
      {toolbar && (
        <button
          type="button"
          // pointerdown, not click: acting before the browser collapses the
          // selection keeps the selected text available.
          onPointerDown={(event) => {
            event.preventDefault();
            onHighlight(toolbar.text);
            window.getSelection()?.removeAllRanges();
            setToolbar(null);
          }}
          style={{ top: toolbar.top, left: toolbar.left }}
          className="absolute z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-ivory shadow-raised transition-colors hover:bg-primary-dark"
        >
          <Highlighter size={14} aria-hidden />
          Highlight
        </button>
      )}

      {/* Long-form reading: reading-size type, generous line height. */}
      <div className="flex flex-col gap-4 text-lg leading-8 text-ink">
        {paragraphs.map((paragraph, index) => (
          <MarkedParagraph
            key={index}
            text={paragraph}
            highlightTexts={highlightTexts}
          />
        ))}
      </div>
    </div>
  );
}
