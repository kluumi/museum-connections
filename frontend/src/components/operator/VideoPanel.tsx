import { useCallback, useEffect, useRef, useState } from "react";
import { StreamingBadge } from "@/components/shared/StatusBadge";
import { VoxBadge } from "@/components/shared/VoxBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConnectionState } from "@/constants/connection-states";
import type { NodeId } from "@/constants/node-ids";
import { cn } from "@/lib/utils";
import type { PeerMetrics } from "@/types/metrics";
import { ObsStatusBadge } from "./ObsStatusBadge";
import { SenderStatusBadge } from "./SenderStatusBadge";
import { VideoControlBar } from "./VideoControlBar";
import { VideoStatsBar } from "./VideoStatsBar";
import { VideoWithOverlays } from "./VideoWithOverlays";

interface VideoPanelProps {
  title: string;
  emoji: string;
  stream: MediaStream | null;
  metrics: PeerMetrics | null;
  isConnected: boolean;
  accentColor: "nantes" | "paris";
  noSignalMessage?: string;
  className?: string;
  /** Show inline stats bar under video (default: true for backwards compat) */
  showInlineStats?: boolean;
  /** WebRTC connection state for badge display */
  connectionState?: ConnectionState;
  /** Whether the sender is available (connected to signaling) */
  isSenderAvailable?: boolean;
  /** Callback to send remote stream control command */
  onStreamControl?: (action: "start" | "stop") => void;
  /** Show loading overlay with blur - "starting" or "stopping" mode */
  isLoading?: "starting" | "stopping" | false;
  /** OBS receiver node ID to show status for */
  obsReceiverId?: NodeId;
  /** Whether the OBS receiver is connected */
  isObsConnected?: boolean;
  /** If true, show "Arrêté" instead of "Reconnexion..." when WebRTC is reconnecting */
  manuallyStopped?: boolean;
  /** VOX state - is this sender triggering ducking (TX) */
  isVoxTriggered?: boolean;
  /** VOX state - is this sender being ducked (RX) */
  isDucked?: boolean;
}

const accentStyles = {
  nantes: {
    text: "text-primary",
  },
  paris: {
    text: "text-primary",
  },
};

export function VideoPanel({
  title,
  emoji,
  stream,
  metrics,
  isConnected,
  accentColor,
  noSignalMessage,
  className,
  showInlineStats = true,
  connectionState,
  isSenderAvailable = false,
  onStreamControl,
  isLoading = false,
  obsReceiverId,
  isObsConnected = false,
  manuallyStopped = false,
  isVoxTriggered = false,
  isDucked = false,
}: VideoPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(0); // 0-100, starts muted

  const styles = accentStyles[accentColor];

  const handleFullscreen = useCallback(() => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    }
  }, []);

  // Track fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  return (
    <Card className={cn("overflow-hidden", className)}>
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <span>{emoji}</span>
            <span className={styles.text}>{title}</span>
          </CardTitle>

          <div className="flex items-center gap-2">
            {/* VOX Badges */}
            {isVoxTriggered && <VoxBadge type="speaking" />}
            {isDucked && <VoxBadge type="muted" />}
            <SenderStatusBadge title={title} isAvailable={isSenderAvailable} />
            {obsReceiverId && <ObsStatusBadge isConnected={isObsConnected} />}
            {connectionState && (
              <StreamingBadge
                state={connectionState}
                targetName={title}
                manuallyStopped={manuallyStopped}
              />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Video Container with Controls */}
        <div ref={containerRef}>
          <VideoWithOverlays
            stream={stream}
            isConnected={isConnected}
            isMuted={isMuted}
            volume={volume}
            isLoading={isLoading}
            isFullscreen={isFullscreen}
            noSignalMessage={noSignalMessage}
            title={title}
            onExitFullscreen={handleFullscreen}
          />

          <VideoControlBar
            stream={stream}
            isConnected={isConnected}
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleFullscreen}
            accentColor={accentColor}
            title={title}
            isSenderAvailable={isSenderAvailable}
            isObsConnected={isObsConnected}
            onStreamControl={onStreamControl}
            isLoading={isLoading}
            onMuteChange={setIsMuted}
            onVolumeChange={setVolume}
          />
        </div>

        {/* Stats Bar - only shown when showInlineStats is true */}
        {isConnected && showInlineStats && (
          <VideoStatsBar metrics={metrics} accentColor={accentColor} />
        )}
      </CardContent>
    </Card>
  );
}
