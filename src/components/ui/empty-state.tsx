export function EmptyState({
  icon,
  heading,
  subtext,
  cta,
}: {
  icon?: React.ReactNode;
  heading: string;
  subtext?: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && (
        <div className="flex size-14 items-center justify-center rounded-full bg-primary-light text-2xl text-primary">
          {icon}
        </div>
      )}
      <h2 className="text-lg font-semibold text-ink">{heading}</h2>
      {subtext && <p className="max-w-xs text-sm text-ink-soft">{subtext}</p>}
      {cta && <div className="mt-2">{cta}</div>}
    </div>
  );
}
