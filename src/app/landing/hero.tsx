"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";
import { useInstantAccess } from "@/lib/use-instant-access";
import heroImage from "@/assets/main_image_landing_page.png";

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
        className="relative z-10 flex flex-col gap-7"
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

      {/* Right: atmospheric hero image with the glowing Round ring motif */}
      <motion.div
        style={{ y: drift }}
        initial={reduced ? false : { opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="relative aspect-[4/5] w-full md:aspect-auto md:-ml-24 md:h-[36rem] md:w-[calc(100%+6rem)]"
        aria-hidden={verse ? undefined : true}
      >
        {/* The image's own pixels dissolve before reaching the container's
            left edge (CSS mask), so no hard cutoff exists for overlays to
            hide — the mist SVG then makes the fade contour irregular. */}
        <Image
          src={heroImage}
          alt="Sunrise over a mountain river framed by a glowing circle of light"
          fill
          priority
          placeholder="blur"
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
          style={{
            maskImage:
              "linear-gradient(to right, transparent 0%, black 45%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, black 45%)",
          }}
        />
        {/* Seamless dissolve into the page: an elliptical parchment vignette
            (no frame, no edge) plus a wider wash toward the text column. The
            overlays match the page background exactly, so the image appears
            to melt into mist rather than sit in a box. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 76% 66% at 56% 46%, transparent 57%, color-mix(in oklab, var(--color-parchment) 50%, transparent) 78%, var(--color-parchment) 99%)",
          }}
        />
        {/* Organic left contour: two blurred, irregular parchment silhouettes
            whose edges drift ±20–60px — mist rolling in from the text column
            instead of a ruler-straight gradient. */}
        <svg
          className="absolute inset-y-0 left-0 h-full w-[55%]"
          viewBox="0 0 400 900"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <filter id="mist-soft" x="-60%" y="-20%" width="220%" height="140%">
              <feGaussianBlur stdDeviation="42" />
            </filter>
            <filter id="mist-near" x="-60%" y="-20%" width="220%" height="140%">
              <feGaussianBlur stdDeviation="24" />
            </filter>
          </defs>
          {/* Far drift: wide, faint, slow undulation */}
          <path
            d="M0 0 H210 C 260 90, 170 190, 225 300 C 280 410, 160 500, 215 620 C 265 730, 175 800, 230 900 H0 Z"
            fill="var(--color-parchment)"
            opacity="0.55"
            filter="url(#mist-soft)"
          />
          {/* Near drift: tighter contour, stronger presence */}
          <path
            d="M0 0 H130 C 175 70, 95 170, 150 270 C 205 370, 85 470, 140 580 C 195 690, 100 780, 155 900 H0 Z"
            fill="var(--color-parchment)"
            opacity="0.9"
            filter="url(#mist-near)"
          />
        </svg>
        <div className="absolute inset-x-0 top-0 h-1/6 bg-gradient-to-b from-parchment to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-parchment via-parchment/40 to-transparent" />

        {/* Scripture quote — fetched live from YouVersion, shown only when the
            fetch succeeded. Rendering nothing beats rendering hardcoded text. */}
        {verse && (
          <figure className="absolute inset-x-8 bottom-4 text-center">
            <blockquote className="font-hand text-2xl leading-snug text-charcoal/80">
              “{verse.text}”
            </blockquote>
            <figcaption className="mt-1 text-xs tracking-wide text-gold">
              {verse.reference} · {verse.versionAbbreviation}
            </figcaption>
          </figure>
        )}
      </motion.div>
    </section>
  );
}
