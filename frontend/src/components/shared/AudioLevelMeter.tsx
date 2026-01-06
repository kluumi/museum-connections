import { Volume2, VolumeX } from "lucide-react";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import { cn } from "@/lib/utils";

interface AudioLevelMeterProps {
  stream: MediaStream | null;
  /** Orientation: horizontal or vertical */
  orientation?: "horizontal" | "vertical";
  /** Show peak indicator */
  showPeak?: boolean;
  /** Show numeric dB value */
  showDb?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Custom class name */
  className?: string;
  /** Accent color variant */
  accentColor?: "default" | "nantes" | "paris";
}

/**
 * Real-time audio level meter (VU meter) component
 * Uses Web Audio API to display audio levels from a MediaStream
 */
export function AudioLevelMeter({
  stream,
  orientation = "horizontal",
  showPeak = true,
  showDb = false,
  size = "md",
  className,
  accentColor = "default",
}: AudioLevelMeterProps) {
  const { level, peak, isClipping } = useAudioLevel(stream);

  // Convert level to dB (approximate)
  const db = level > 0 ? Math.round(20 * Math.log10(level)) : -60;

  // Size classes
  const sizeClasses = {
    sm: orientation === "horizontal" ? "h-2" : "w-2",
    md: orientation === "horizontal" ? "h-3" : "w-3",
    lg: orientation === "horizontal" ? "h-4" : "w-4",
  };

  // Accent color classes for the meter fill
  const accentClasses = {
    default: "from-green-500 via-yellow-500 to-red-500",
    nantes: "from-blue-500 via-blue-400 to-red-500",
    paris: "from-purple-500 via-purple-400 to-red-500",
  };

  const isHorizontal = orientation === "horizontal";

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        !isHorizontal && "flex-col",
        className,
      )}
    >
      {/* Icon */}
      {stream ? (
        <Volume2
          className={cn(
            "shrink-0 text-muted-foreground",
            size === "sm" && "h-3 w-3",
            size === "md" && "h-4 w-4",
            size === "lg" && "h-5 w-5",
            isClipping && "text-red-500",
          )}
        />
      ) : (
        <VolumeX
          className={cn(
            "shrink-0 text-muted-foreground",
            size === "sm" && "h-3 w-3",
            size === "md" && "h-4 w-4",
            size === "lg" && "h-5 w-5",
          )}
        />
      )}

      {/* Meter container */}
      <div
        className={cn(
          "relative overflow-hidden rounded-full bg-muted",
          isHorizontal ? "w-full" : "h-full",
          sizeClasses[size],
        )}
      >
        {/* Level bar */}
        <div
          className={cn(
            "absolute rounded-full bg-gradient-to-r transition-all duration-75",
            accentClasses[accentColor],
            isHorizontal ? "left-0 top-0 h-full" : "bottom-0 left-0 w-full",
            isClipping && "animate-pulse",
          )}
          style={
            isHorizontal
              ? { width: `${level * 100}%` }
              : { height: `${level * 100}%` }
          }
        />

        {/* Peak indicator */}
        {showPeak && peak > 0 && (
          <div
            className={cn(
              "absolute bg-white/80 transition-all duration-100",
              isHorizontal ? "top-0 h-full w-0.5" : "left-0 h-0.5 w-full",
            )}
            style={
              isHorizontal
                ? { left: `${peak * 100}%` }
                : { bottom: `${peak * 100}%` }
            }
          />
        )}
      </div>

      {/* dB value */}
      {showDb && (
        <span
          className={cn(
            "shrink-0 font-mono text-muted-foreground",
            size === "sm" && "text-[10px]",
            size === "md" && "text-xs",
            size === "lg" && "text-sm",
            isClipping && "text-red-500",
          )}
        >
          {db > -60 ? `${db}dB` : "-∞"}
        </span>
      )}
    </div>
  );
}
