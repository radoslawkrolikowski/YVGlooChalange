"use client";

import {
  BookOpenText,
  Compass,
  Footprints,
  Globe2,
  HeartHandshake,
  Library,
  MessagesSquare,
  ScrollText,
  Sparkles,
  UserRoundPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useInstantAccess } from "@/lib/use-instant-access";
import { FadeUp } from "./motion";

/* ---------- Value propositions ---------- */

const values = [
  {
    icon: Users,
    title: "Small circles",
    body: "Real relationships instead of endless feeds. Three to five people, one shared plan.",
  },
  {
    icon: Sparkles,
    title: "AI facilitated",
    body: "A team of specialised AI agents gently guides discussions — never replacing them.",
  },
  {
    icon: BookOpenText,
    title: "Scripture first",
    body: "Technology exists to deepen engagement with God's Word, not to compete with it.",
  },
] as const;

export function ValueProps() {
  return (
    <section id="circles" className="mx-auto w-full max-w-6xl px-6 py-20 lg:px-10">
      <div className="grid gap-6 md:grid-cols-3">
        {values.map(({ icon: Icon, title, body }, i) => (
          <FadeUp key={title} delay={i * 0.12}>
            <div className="flex h-full flex-col gap-4 rounded-3xl border border-charcoal/8 bg-ivory p-8 shadow-card">
              <span className="flex size-11 items-center justify-center rounded-full bg-sage-soft text-forest">
                <Icon size={22} strokeWidth={1.5} aria-hidden />
              </span>
              <h3 className="font-serif text-xl text-charcoal">{title}</h3>
              <p className="text-sm leading-relaxed text-charcoal/65">{body}</p>
            </div>
          </FadeUp>
        ))}
      </div>
    </section>
  );
}

/* ---------- How it works ---------- */

const steps = [
  {
    icon: UserRoundPlus,
    title: "Join",
    body: "One tap to begin. No pressure, no commitments.",
  },
  {
    icon: Users,
    title: "Get matched into a circle",
    body: "A small group on the same reading plan, chosen for you.",
  },
  {
    icon: Footprints,
    title: "Read on your own schedule",
    body: "Follow the plan at the pace that fits your life.",
  },
  {
    icon: MessagesSquare,
    title: "Discuss together",
    body: "Share reflections and grow closer to God and each other.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 py-20 lg:px-10">
      <FadeUp className="mb-14 text-center">
        <h2 className="font-serif text-3xl text-charcoal md:text-4xl">
          How Round works
        </h2>
        <div aria-hidden className="mx-auto mt-4 h-px w-24 bg-gold/60" />
      </FadeUp>
      <ol className="grid gap-10 md:grid-cols-4 md:gap-6">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <FadeUp key={title} delay={i * 0.12}>
            <li className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-16 items-center justify-center rounded-full border border-gold/40 bg-ivory text-forest shadow-card">
                <Icon size={26} strokeWidth={1.4} aria-hidden />
              </span>
              <p className="text-sm font-semibold text-charcoal">
                <span className="mr-1.5 text-gold">{i + 1}</span>
                {title}
              </p>
              <p className="max-w-[16rem] text-sm leading-relaxed text-charcoal/60">
                {body}
              </p>
            </li>
          </FadeUp>
        ))}
      </ol>
    </section>
  );
}

/* ---------- AI team ---------- */

const team = [
  {
    icon: Compass,
    name: "The Guide",
    body: "Keeps discussions focused and on track.",
  },
  {
    icon: ScrollText,
    name: "The Scholar",
    body: "Provides historical and biblical context.",
  },
  {
    icon: HeartHandshake,
    name: "The Encourager",
    body: "Invites quieter members into conversation.",
  },
  {
    icon: Sparkles,
    name: "The Reflector",
    body: "Connects Scripture with everyday life.",
  },
] as const;

export function AiTeam() {
  return (
    <section id="ai-team" className="bg-forest-deep py-24">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 lg:grid-cols-[1fr_1.4fr] lg:px-10">
        <FadeUp className="flex flex-col gap-5">
          <h2 className="font-serif text-3xl leading-snug text-ivory md:text-4xl">
            AI that facilitates,
            <br />
            so you can focus.
          </h2>
          <div aria-hidden className="h-px w-16 bg-gold/60" />
          <p className="max-w-sm text-sm leading-relaxed text-ivory/60">
            Round's team of specialised AI agents helps spark meaningful
            discussion, keeps the conversation on track, and makes space for
            every voice. They facilitate — the relationships stay human.
          </p>
        </FadeUp>
        <div className="grid gap-4 sm:grid-cols-2">
          {team.map(({ icon: Icon, name, body }, i) => (
            <FadeUp key={name} delay={i * 0.1}>
              <div className="flex h-full flex-col gap-3 rounded-3xl border border-ivory/10 bg-forest p-6 transition-transform duration-300 hover:-translate-y-1">
                <span className="flex size-11 items-center justify-center rounded-full bg-gold/15 text-gold">
                  <Icon size={22} strokeWidth={1.5} aria-hidden />
                </span>
                <h3 className="font-serif text-lg text-ivory">{name}</h3>
                <p className="text-sm leading-relaxed text-ivory/55">{body}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Social proof ---------- */

const metrics = [
  { icon: Users, value: "12K+", label: "People in circles" },
  { icon: Library, value: "250+", label: "Reading plans" },
  { icon: Globe2, value: "120+", label: "Countries" },
] as const;

export function SocialProof() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20 lg:px-10">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <FadeUp>
          <figure className="flex flex-col gap-4">
            <span aria-hidden className="font-serif text-5xl leading-none text-gold">
              “
            </span>
            <blockquote className="font-serif text-xl leading-relaxed text-charcoal md:text-2xl">
              Round has turned my quiet reading into conversations that
              challenge and encourage me every day.
            </blockquote>
            <figcaption className="text-sm text-charcoal/55">
              Sarah M. · Round member
            </figcaption>
          </figure>
        </FadeUp>
        <div className="grid grid-cols-3 gap-4">
          {metrics.map(({ icon: Icon, value, label }, i) => (
            <FadeUp key={label} delay={i * 0.1}>
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-sage-soft text-forest">
                  <Icon size={20} strokeWidth={1.5} aria-hidden />
                </span>
                <p className="font-serif text-3xl text-charcoal">{value}</p>
                <p className="text-xs text-charcoal/55">{label}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Final CTA ---------- */

export function FinalCta({ authenticated }: { authenticated: boolean }) {
  const { enter, busy, error } = useInstantAccess();

  return (
    <section className="px-6 pb-24 pt-4 lg:px-10">
      <FadeUp className="mx-auto max-w-4xl">
        <div className="flex flex-col items-center gap-7 rounded-[2.5rem] bg-gradient-to-b from-sage-soft to-parchment px-8 py-16 text-center shadow-card">
          <h2 className="max-w-xl font-serif text-3xl leading-snug text-charcoal md:text-4xl">
            Your next Bible study starts with one conversation.
          </h2>
          {authenticated ? (
            <Link
              href="/home"
              className="rounded-full bg-forest px-8 py-4 text-base font-semibold text-ivory shadow-raised transition-all hover:-translate-y-0.5 hover:bg-forest-deep"
            >
              Continue to Round
            </Link>
          ) : (
            <>
              <button
                type="button"
                onClick={enter}
                disabled={busy}
                className="rounded-full bg-forest px-8 py-4 text-base font-semibold text-ivory shadow-raised transition-all hover:-translate-y-0.5 hover:bg-forest-deep disabled:opacity-60"
              >
                {busy ? "Entering…" : "Start Reading Together"}
              </button>
              {error && <p className="text-sm text-danger">{error}</p>}
              <p className="text-xs text-charcoal/50">
                No form, no account needed to try. Nothing is saved after you
                close the browser.
              </p>
            </>
          )}
        </div>
      </FadeUp>
    </section>
  );
}
