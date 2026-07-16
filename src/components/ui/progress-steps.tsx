/*
 * Stepped progress indicator (Step 9, reused by Steps 10–12): the onboarding
 * flow's "Step n of m" header. Completed steps fill solid, the current step
 * gets the wide primary pill, upcoming steps stay muted — editorial register,
 * no percentages, no numbers on the dots themselves.
 */
export function ProgressSteps({
  steps,
  current,
}: {
  /** Ordered step labels, e.g. ["Language & Bible", "About you", "Your plan"]. */
  steps: string[];
  /** Zero-based index of the current step. */
  current: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={current + 1}
        aria-valuetext={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}
        className="flex items-center gap-1.5"
      >
        {steps.map((label, index) => (
          <span
            key={label}
            aria-hidden
            className={`h-1.5 rounded-full transition-all ${
              index === current
                ? "flex-[2] bg-primary"
                : index < current
                  ? "flex-1 bg-primary/50"
                  : "flex-1 bg-line"
            }`}
          />
        ))}
      </div>
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
        Step {current + 1} of {steps.length}
        <span className="font-normal normal-case tracking-normal text-ink-soft">
          {" "}
          — {steps[current]}
        </span>
      </p>
    </div>
  );
}
