import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

type QualityLevel = "excellent" | "good" | "fair" | "poor" | "none";

interface QualityConfig {
  level: QualityLevel;
  label: string;
  labelFr: string;
  bars: number; // 0-4
  color: string;
  bgColor: string;
}

function getQualityConfig(score: number): QualityConfig {
  if (score >= 80) {
    return {
      level: "excellent",
      label: "Excellent",
      labelFr: "Excellent",
      bars: 4,
      color: "bg-emerald-500",
      bgColor: "bg-emerald-500/20",
    };
  }
  if (score >= 60) {
    return {
      level: "good",
      label: "Good",
      labelFr: "Bon",
      bars: 3,
      color: "bg-lime-500",
      bgColor: "bg-lime-500/20",
    };
  }
  if (score >= 40) {
    return {
      level: "fair",
      label: "Fair",
      labelFr: "Moyen",
      bars: 2,
      color: "bg-amber-500",
      bgColor: "bg-amber-500/20",
    };
  }
  if (score > 0) {
    return {
      level: "poor",
      label: "Poor",
      labelFr: "Faible",
      bars: 1,
      color: "bg-red-500",
      bgColor: "bg-red-500/20",
    };
  }
  return {
    level: "none",
    label: "No signal",
    labelFr: "Pas de signal",
    bars: 0,
    color: "bg-muted-foreground",
    bgColor: "bg-muted",
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
export function NetworkQualityIndicator({
  qualityScore,
  showTooltip = true,
  size = "md",
  className,
}: NetworkQualityIndicatorProps) {
  const config = getQualityConfig(qualityScore);
  const sizes = sizeConfig[size];

  const indicator = (
    <div
      className={cn("flex items-end", sizes.container, className)}
      aria-label={`Qualité réseau: ${config.labelFr} (${qualityScore}/100)`}
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
            Qualité réseau : {config.labelFr} ({qualityScore}/100)
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
}
