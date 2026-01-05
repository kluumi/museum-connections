import { memo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getQualityLevel,
  QUALITY_LABELS,
  type QualityLevel,
} from "@/constants/metrics";
import { cn } from "@/lib/utils";

interface NetworkQualityIndicatorProps {
  /** Quality score 0-100 */
  qualityScore: number;
  /** Show tooltip with details */
  showTooltip?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Custom class name */
  className?: string;
}

/** Signal bars configuration per quality level */
const SIGNAL_BARS_CONFIG: Record<
  QualityLevel,
  { bars: number; color: string }
> = {
  excellent: { bars: 4, color: "bg-emerald-500" },
  good: { bars: 3, color: "bg-lime-500" },
  fair: { bars: 2, color: "bg-amber-500" },
  poor: { bars: 1, color: "bg-red-500" },
  none: { bars: 0, color: "bg-muted-foreground" },
};

function getSignalConfig(score: number) {
  const level = getQualityLevel(score);
  return {
    level,
    label: QUALITY_LABELS[level],
    ...SIGNAL_BARS_CONFIG[level],
  };
}

const sizeConfig = {
  sm: {
    container: "h-4 gap-0.5",
    bar: "w-1",
    heights: ["h-1", "h-1.5", "h-2.5", "h-3.5"],
  },
  md: {
    container: "h-5 gap-0.5",
    bar: "w-1.5",
    heights: ["h-1.5", "h-2.5", "h-3.5", "h-5"],
  },
  lg: {
    container: "h-6 gap-1",
    bar: "w-2",
    heights: ["h-2", "h-3", "h-4.5", "h-6"],
  },
};

/**
 * Signal bars indicator showing network quality
 * Based on quality score (0-100)
 */
export const NetworkQualityIndicator = memo(function NetworkQualityIndicator({
  qualityScore,
  showTooltip = true,
  size = "md",
  className,
}: NetworkQualityIndicatorProps) {
  const config = getSignalConfig(qualityScore);
  const sizes = sizeConfig[size];

  const indicator = (
    <div
      role="img"
      className={cn("flex items-end", sizes.container, className)}
      aria-label={`Qualité réseau: ${config.label} (${qualityScore}/100)`}
    >
      {[0, 1, 2, 3].map((barIndex) => {
        const isActive = barIndex < config.bars;
        return (
          <div
            key={barIndex}
            className={cn(
              "rounded-sm transition-colors",
              sizes.bar,
              sizes.heights[barIndex],
              isActive ? config.color : "bg-muted-foreground/30",
            )}
          />
        );
      })}
    </div>
  );

  if (!showTooltip) {
    return indicator;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-default">{indicator}</div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            Qualité réseau : {config.label} ({qualityScore}/100)
          </p>
          <div className="space-y-0.5 text-xs">
            <p>
              <span className="text-emerald-500">■</span> 80-100 : Excellent
            </p>
            <p>
              <span className="text-lime-500">■</span> 60-79 : Bon
            </p>
            <p>
              <span className="text-amber-500">■</span> 40-59 : Moyen
            </p>
            <p>
              <span className="text-red-500">■</span> 0-39 : Faible
            </p>
          </div>
          <p className="text-muted-foreground pt-1">
            Basé sur la latence, pertes, FPS, jitter, bitrate, résolution, bande
            passante et images perdues.
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
});
