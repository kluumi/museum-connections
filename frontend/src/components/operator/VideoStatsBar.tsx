import { AlertTriangle, Gauge, MonitorPlay, Timer } from "lucide-react";
import { memo } from "react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { PeerMetrics } from "@/types/metrics";

interface VideoStatsBarProps {
  metrics: PeerMetrics | null;
  accentColor: "nantes" | "paris";
}

const accentStyles = {
  nantes: {
    text: "text-primary",
    progress: "[&>div]:bg-primary",
  },
  paris: {
    text: "text-primary",
    progress: "[&>div]:bg-primary",
  },
};

function formatBitrate(kbps: number): string {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  if (kbps >= 1) return `${Math.round(kbps)} kbps`;
  return `${kbps.toFixed(1)} kbps`;
}

/**
 * Stats bar showing video quality metrics below the video player.
 */
export const VideoStatsBar = memo(function VideoStatsBar({
  metrics,
  accentColor,
}: VideoStatsBarProps) {
  const styles = accentStyles[accentColor];
  const video = metrics?.video;
  const connection = metrics?.connection;
  const qualityScore = metrics?.qualityScore ?? 0;

  return (
    <div className="border-t p-3 space-y-3">
      {/* Quality Progress */}
      <Progress value={qualityScore} className={cn("h-1", styles.progress)} />

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 text-xs">
        <div className="flex items-center gap-2">
          <Timer className="h-3.5 w-3.5 text-muted-foreground" />
          <div>
            <p className="text-muted-foreground">RTT</p>
            <p className={cn("font-mono font-medium", styles.text)}>
              {connection?.rtt ? `${connection.rtt.toFixed(0)}ms` : "-"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
          <div>
            <p className="text-muted-foreground">Bitrate</p>
            <p className={cn("font-mono font-medium", styles.text)}>
              {video?.bitrate ? formatBitrate(video.bitrate) : "-"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MonitorPlay className="h-3.5 w-3.5 text-muted-foreground" />
          <div>
            <p className="text-muted-foreground">FPS</p>
            <p className={cn("font-mono font-medium", styles.text)}>
              {video?.fps ? Math.round(video.fps) : "-"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle
            className={cn(
              "h-3.5 w-3.5",
              (video?.packetLoss ?? 0) > 2
                ? "text-amber-500"
                : "text-muted-foreground",
            )}
          />
          <div>
            <p className="text-muted-foreground">Pertes</p>
            <p className={cn("font-mono font-medium", styles.text)}>
              {video?.packetLoss !== undefined
                ? `${video.packetLoss.toFixed(1)}%`
                : "-"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});
