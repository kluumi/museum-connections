import { cn } from "@/lib/utils";

export type QualityLevel = "excellent" | "good" | "fair" | "poor";

interface QualityBadgeProps {
  quality: QualityLevel;
  className?: string;
}

const qualityConfig: Record<
  QualityLevel,
  { label: string; className: string }
> = {
  excellent: {
    label: "EXCELLENT",
    className: "bg-[var(--status-online)] text-black",
  },
  good: {
    label: "BON",
    className: "bg-lime-400 text-black",
  },
  fair: {
    label: "MOYEN",
    className: "bg-[var(--status-pending)] text-black",
  },
  poor: {
    label: "MAUVAIS",
    className: "bg-[var(--status-offline)] text-white",
  },
};

export function getQualityFromScore(score: number): QualityLevel {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "poor";
}

export function QualityBadge({ quality, className }: QualityBadgeProps) {
  const config = qualityConfig[quality];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
