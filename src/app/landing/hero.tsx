"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRef } from "react";
import { useInstantAccess } from "@/lib/use-instant-access";

export interface HeroVerse {
  /** Verse text fetched live from YouVersion — never hardcoded. */
  text: string;
  reference: string;
  versionAbbreviation: string;
}

export function Hero({ verse }: { verse: HeroVerse | null }) {
  const { enter, busy, error } = useInstantAccess();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const drift = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 60]);

  return (
    <section
      ref={ref}
      className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pb-20 pt-8 md:min-h-[calc(100dvh-5.5rem)] md:grid-cols-2 md:gap-6 md:pb-16 md:pt-0 lg:px-10"
    >
      {/* Left: headline and CTAs */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.22, 0.61, 0.36, 1] }}
        className="flex flex-col gap-7"
      >
        <h1 className="font-serif text-4xl leading-[1.15] tracking-tight text-charcoal md:text-5xl">
          Some things are better read{" "}
          <em className="text-forest">together</em>.
        </h1>
        <p className="max-w-md text-base leading-relaxed text-charcoal/70 md:text-lg">
          Round brings small groups of people through the same Bible reading
          plan, each at their own pace, while AI facilitators help
          conversations become thoughtful, encouraging and consistent.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={enter}
            disabled={busy}
            className="rounded-full bg-forest px-7 py-3.5 text-base font-semibold text-ivory shadow-raised transition-all hover:-translate-y-0.5 hover:bg-forest-deep disabled:opacity-60"
          >
            {busy ? "Entering…" : "Try Round"}
          </button>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 text-base font-medium text-forest transition-colors hover:text-forest-deep"
          >
            See how it works <ArrowRight size={18} aria-hidden />
          </a>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </motion.div>

      {/* Right: atmospheric scene, CSS/SVG only — no stock photography */}
      <motion.div
        style={{ y: drift }}
        initial={reduced ? false : { opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] shadow-raised md:aspect-auto md:h-[34rem]"
        aria-hidden={verse ? undefined : true}
      >
        {/* Layered dawn: deep forest horizon, gold bloom, mist */}
        <div className="absolute inset-0 bg-gradient-to-b from-gold-soft via-[color-mix(in_oklab,var(--color-gold)_45%,var(--color-parchment))] to-forest-deep" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 45% at 50% 42%, color-mix(in oklab, var(--color-gold) 70%, white) 0%, transparent 70%)",
          }}
        />
        {/* Glowing ring — the Round motif */}
        <svg
          viewBox="0 0 400 500"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            <radialGradient id="bloom" cx="50%" cy="42%" r="40%">
              <stop offset="0%" stopColor="#fff7e0" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#fff7e0" stopOpacity="0" />
            </radialGradient>
            <filter id="soften">
              <feGaussianBlur stdDeviation="2.5" />
            </filter>
          </defs>
          <circle cx="200" cy="210" r="118" fill="url(#bloom)" />
          <circle
            cx="200"
            cy="210"
            r="112"
            fill="none"
            stroke="#fdf3d8"
            strokeWidth="3"
            filter="url(#soften)"
            opacity="0.95"
          />
          <circle
            cx="200"
            cy="210"
            r="112"
            fill="none"
            stroke="#f3e0b0"
            strokeWidth="8"
            filter="url(#soften)"
            opacity="0.25"
          />
          {/* Still water: horizon line and soft reflections */}
          <rect x="0" y="330" width="400" height="170" fill="#0f221e" opacity="0.55" />
          <ellipse cx="200" cy="345" rx="130" ry="7" fill="#f3e0b0" opacity="0.3" filter="url(#soften)" />
          <ellipse cx="200" cy="368" rx="90" ry="5" fill="#f3e0b0" opacity="0.18" filter="url(#soften)" />
          <ellipse cx="200" cy="392" rx="55" ry="4" fill="#f3e0b0" opacity="0.1" filter="url(#soften)" />
        </svg>

        {/* Scripture quote — fetched live from YouVersion, shown only when the
            fetch succeeded. Rendering nothing beats rendering hardcoded text. */}
        {verse && (
          <figure className="absolute inset-x-6 bottom-6 text-center">
            <blockquote className="font-hand text-2xl leading-snug text-gold-soft/95">
              “{verse.text}”
            </blockquote>
            <figcaption className="mt-1 text-xs tracking-wide text-gold-soft/60">
              {verse.reference} · {verse.versionAbbreviation}
            </figcaption>
          </figure>
        )}
      </motion.div>
    </section>
  );
}
