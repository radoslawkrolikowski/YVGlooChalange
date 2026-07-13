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

      {/* Right: atmospheric hero image with the glowing Round ring motif */}
      <motion.div
        style={{ y: drift }}
        initial={reduced ? false : { opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] shadow-raised md:aspect-auto md:h-[34rem]"
        aria-hidden={verse ? undefined : true}
      >
        <Image
          src={heroImage}
          alt="Sunrise over a mountain river framed by a glowing circle of light"
          fill
          priority
          placeholder="blur"
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
        />
        {/* Soft darkening at the base so the quote stays legible */}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-forest-deep/70 to-transparent" />

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
