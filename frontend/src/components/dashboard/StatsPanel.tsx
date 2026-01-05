import { Activity, HelpCircle, Signal } from "lucide-react";
import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getQualityLevel,
  QUALITY_LABELS,
  QUALITY_PROGRESS_COLORS,
  QUALITY_TEXT_COLORS,
} from "@/constants/metrics";
import { cn } from "@/lib/utils";
import type { PeerMetrics } from "@/types/metrics";
import { BandwidthUsageIndicator } from "./BandwidthUsageIndicator";
import { NetworkSpeedIndicator } from "./NetworkSpeedIndicator";
import { StatsGrid } from "./StatsGrid";

interface StatsPanelProps {
  metrics: PeerMetrics | null;
  className?: string;
  isStreaming?: boolean;
  hideBandwidth?: boolean;
}

function getQualityStyle(score: number) {
  const level = getQualityLevel(score);
  return {
    label: QUALITY_LABELS[level],
    color: QUALITY_TEXT_COLORS[level],
    progress: QUALITY_PROGRESS_COLORS[level],
  };
}

function QualityHeader({
  isStreaming,
  qualityScore,
  quality,
}: {
  isStreaming: boolean;
  qualityScore: number;
  quality: ReturnType<typeof getQualityStyle>;
}) {
  if (!isStreaming) {
    return (
      <span className="text-sm text-muted-foreground">
        En attente de diffusion
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-3 cursor-help">
          <span className={cn("text-sm font-medium", quality.color)}>
            {quality.label}
          </span>
          <span className={cn("font-mono text-lg font-bold", quality.color)}>
            {qualityScore}
            <span className="text-xs text-muted-foreground">/100</span>
          </span>
          <HelpCircle className="h-4 w-4 text-muted-foreground/50" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Score de qualité</p>
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

export const StatsPanel = memo(function StatsPanel({
  metrics,
  className,
  isStreaming = true,
  hideBandwidth = false,
}: StatsPanelProps) {
  const video = metrics?.video;
  const connection = metrics?.connection;
  const qualityScore = metrics?.qualityScore ?? 0;

  // Memoize quality style calculation
  const quality = useMemo(() => getQualityStyle(qualityScore), [qualityScore]);

  // Memoize bandwidth calculations
  const { availableBandwidth, currentBitrate } = useMemo(
    () => ({
      availableBandwidth:
        connection?.availableOutgoingBitrate ||
        connection?.availableIncomingBitrate ||
        0,
      currentBitrate: video?.bitrate ?? 0,
    }),
    [
      connection?.availableOutgoingBitrate,
      connection?.availableIncomingBitrate,
      video?.bitrate,
    ],
  );

  return (
    <Card className={cn(className, !isStreaming && "opacity-60")}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Qualité du flux
          </CardTitle>
          <QualityHeader
            isStreaming={isStreaming}
            qualityScore={qualityScore}
            quality={quality}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress
          value={isStreaming ? qualityScore : 0}
          className={cn("h-1.5", isStreaming ? quality.progress : "")}
        />

        <StatsGrid
          video={video}
          connection={connection}
          hideBandwidth={hideBandwidth}
        />

        <div className="border-t pt-4">
          <h4 className="flex items-center gap-2 text-sm font-medium mb-3">
            <Signal className="h-4 w-4" />
            Qualité réseau
          </h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NetworkSpeedIndicator />
            <BandwidthUsageIndicator
              currentBitrate={currentBitrate}
              availableBandwidth={availableBandwidth}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
