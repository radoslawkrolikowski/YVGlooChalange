export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-gold-soft ${className}`} />;
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
        {title}
      </h2>
      {action}
    </div>
  );
}
