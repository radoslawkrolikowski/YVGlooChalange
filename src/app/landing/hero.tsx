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
  const drift = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : -40]);

  return (
    // Full-bleed hero: the section spans the viewport; only the text column
    // is constrained. The image runs flush to the right edge of the browser.
    <section
      ref={ref}
      className="relative w-full overflow-hidden pb-20 md:min-h-[calc(100dvh-5.5rem)] md:pb-0"
    >
      {/* Left: headline and CTAs, inside the constrained content container.
          The text block's max-width ends before the image's 45vw start line
          (minus a buffer), so text never overlaps the image at any width:
          45vw − container-left-offset (max(0px, 50vw − 36rem)) − 5rem. */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.22, 0.61, 0.36, 1] }}
        className="relative z-10 mx-auto flex max-w-6xl flex-col gap-7 px-6 pt-8 md:min-h-[calc(100dvh-5.5rem)] md:w-full md:justify-center md:pt-0 lg:px-10 md:[&>*]:max-w-[calc(45vw-max(0px,50vw-36rem)-5rem)]"
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

      {/* Right: atmospheric hero image, flush to the viewport's right edge.
          Extends 2.5rem below the section so the upward parallax drift never
          reveals a gap; the section's overflow-hidden clips the excursion. */}
      <motion.div
        style={{ y: drift }}
        initial={reduced ? false : { opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="relative mt-10 aspect-[4/5] w-full md:absolute md:-bottom-10 md:right-0 md:left-[45%] md:mt-0 md:aspect-auto md:top-0 md:w-auto"
        aria-hidden={verse ? undefined : true}
      >
        {/* The image's own pixels dissolve at the left, top, and bottom via
            composited CSS masks — no hard cutoff exists anywhere except the
            flush right edge. The mist SVG makes the left contour irregular. */}
        <Image
          src={heroImage}
          alt="Sunrise over a mountain river framed by a glowing circle of light"
          fill
          priority
          placeholder="blur"
          sizes="(min-width: 768px) 55vw, 100vw"
          className="object-cover"
          style={{
            maskImage:
              "linear-gradient(to right, transparent 0%, black 38%), linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)",
            maskComposite: "intersect",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, black 38%), linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)",
            WebkitMaskComposite: "source-in",
          }}
        />
        {/* Organic left contour: two blurred, irregular parchment silhouettes
            whose edges drift ±20–60px — mist rolling in from the text column
            instead of a ruler-straight gradient. */}
        <svg
          className="absolute inset-y-0 left-0 h-full w-[45%]"
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
            opacity="0.40"
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

        {/* Scripture quote — fetched live from YouVersion, shown only when the
            fetch succeeded. Rendering nothing beats rendering hardcoded text.
            Sits above the bottom mask fade, on the dark water. */}
        {verse && (
          <figure className="absolute inset-x-8 bottom-16 text-center md:bottom-24 md:left-[26%] md:right-10">
            <blockquote
              className="font-hand text-2xl leading-snug text-gold-soft/95"
              style={{ textShadow: "0 1px 14px rgba(15, 34, 30, 0.7)" }}
            >
              “{verse.text}”
            </blockquote>
            <figcaption className="mt-1 text-xs tracking-wide text-gold-soft/70">
              {verse.reference} · {verse.versionAbbreviation}
            </figcaption>
          </figure>
        )}
      </motion.div>
    </section>
  );
}
