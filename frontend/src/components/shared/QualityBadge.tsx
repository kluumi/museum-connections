import { memo } from "react";
import {
  getQualityLevel,
  QUALITY_BADGE_CLASSES,
  QUALITY_LABELS_UPPERCASE,
  type QualityLevel,
} from "@/constants/metrics";
import { cn } from "@/lib/utils";

// Re-export for backwards compatibility
export type { QualityLevel };
export { getQualityLevel as getQualityFromScore };

interface QualityBadgeProps {
  quality: QualityLevel;
  className?: string;
}

export const QualityBadge = memo(function QualityBadge({
  quality,
  className,
}: QualityBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        QUALITY_BADGE_CLASSES[quality],
        className,
      )}
    >
      {QUALITY_LABELS_UPPERCASE[quality]}
    </span>
  );
});
