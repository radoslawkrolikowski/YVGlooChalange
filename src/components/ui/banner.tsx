export type BannerTone = "info" | "success" | "warning" | "error";

const tones: Record<BannerTone, string> = {
  info: "bg-info-soft text-primary-dark border-primary/20",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  error: "bg-danger-soft text-danger border-danger/20",
};

export function Banner({
  tone = "info",
  children,
  className = "",
}: {
  tone?: BannerTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md border px-4 py-3 text-sm ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
