import { BookOpen, Sun } from "lucide-react";
import Image from "next/image";
import { Button, Card, SectionLabel } from "@/components/ui";
import watercolour from "@/assets/home_page_asset_1.png";

export interface TodayReading {
  dayNumber: number;
  passageReference: string;
}

/*
 * Today card (Step 8C): the home screen's one hero — elevated ivory card,
 * "TODAY" icon-chip label, and the page's single primary action. Entirely
 * private: no reading time estimate, no streaks, no circle position.
 *
 * Ships rendering the empty state as the default (no plan exists until
 * Step 11); the populated layout below takes over automatically when
 * Step 11/13 pass real plan data.
 */
export function TodayCard({ reading = null }: { reading?: TodayReading | null }) {
  return (
    <Card variant="elevated" className="relative overflow-hidden">
      {/* Decorative watercolour landscape fading in behind the card's right
          side — same gradient-mask technique as the landing hero. Hidden at
          mobile widths so it is never behind text. */}
      <div aria-hidden className="absolute inset-y-0 right-0 hidden w-2/5 md:block">
        <Image
          src={watercolour}
          alt=""
          fill
          sizes="20rem"
          className="object-cover opacity-80"
          style={{
            maskImage:
              "linear-gradient(to right, transparent 0%, black 70%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, black 70%)",
          }}
        />
      </div>

      <div className="relative flex flex-col gap-3 md:max-w-3/5">
        <SectionLabel icon={<Sun size={14} aria-hidden />}>Today</SectionLabel>

        {reading ? (
          <>
            <p className="font-serif text-2xl font-semibold tracking-tight text-ink">
              Day {reading.dayNumber} · {reading.passageReference}
            </p>
            <hr className="w-12 border-t-2 border-gold" />
            <p className="text-sm text-ink-soft">Continue your reading.</p>
          </>
        ) : (
          <>
            <p className="font-serif text-2xl font-semibold tracking-tight text-ink">
              You&rsquo;re almost ready.
            </p>
            <hr className="w-12 border-t-2 border-gold" />
            <p className="text-sm text-ink-soft">
              Your first reading plan will appear here.
            </p>
          </>
        )}

        <Button full disabled={!reading} className="mt-1">
          <BookOpen size={18} aria-hidden />
          Start reading
        </Button>
      </div>
    </Card>
  );
}
