import {
  AlertTriangle,
  Gauge,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorPlay,
  Play,
  Square,
  Timer,
  Video,
  VideoOff,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLevelMeter } from "@/components/shared/AudioLevelMeter";
import { StreamingBadge } from "@/components/shared/StatusBadge";
import { StreamUptime } from "@/components/shared/StreamUptime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ConnectionState } from "@/constants/connection-states";
import type { NodeId } from "@/constants/node-ids";
import { cn } from "@/lib/utils";
import type { PeerMetrics } from "@/types/metrics";

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
}

const accentStyles = {
  nantes: {
    border: "border-primary/20",
    text: "text-primary",
    bg: "bg-primary/10",
    progress: "[&>div]:bg-primary",
    ring: "ring-primary/20",
  },
  paris: {
    border: "border-primary/20",
    text: "text-primary",
    bg: "bg-primary/10",
    progress: "[&>div]:bg-primary",
    ring: "ring-primary/20",
  },
};

function formatBitrate(kbps: number): string {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  if (kbps >= 1) return `${Math.round(kbps)} kbps`;
  return `${kbps.toFixed(1)} kbps`;
}

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
}: VideoPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(0); // 0-100, starts muted
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isMuted = volume === 0;

  useEffect(() => {
    if (videoRef.current) {
      // Always update srcObject when stream changes
      // Set to stream when available, clear when null
      videoRef.current.srcObject = stream;
      if (stream) {
        console.log(
          `🎬 VideoPanel: assigned stream with ${stream.getTracks().length} tracks to video element`,
        );
      } else {
        console.log(`🎬 VideoPanel: cleared video element srcObject`);
      }
    }
  }, [stream]);

  // Sync volume with video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume / 100;
      videoRef.current.muted = volume === 0;
    }
  }, [volume]);

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

  // Store previous volume to restore when unmuting
  const previousVolumeRef = useRef(50);

  const handleToggleMute = useCallback(() => {
    if (volume === 0) {
      // Unmute: restore previous volume or default to 50
      setVolume(previousVolumeRef.current || 50);
    } else {
      // Mute: save current volume and set to 0
      previousVolumeRef.current = volume;
      setVolume(0);
    }
  }, [volume]);

  const handleVolumeChange = useCallback((values: number[]) => {
    const newVolume = values[0];
    setVolume(newVolume);
    if (newVolume > 0) {
      previousVolumeRef.current = newVolume;
    }
  }, []);

  // Get the appropriate volume icon based on level
  const VolumeIcon = isMuted ? VolumeX : volume < 50 ? Volume1 : Volume2;

  const styles = accentStyles[accentColor];
  const video = metrics?.video;
  const connection = metrics?.connection;
  const qualityScore = metrics?.qualityScore ?? 0;

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
            {/* Sender Status */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1.5 cursor-help",
                    isSenderAvailable
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                      : "text-muted-foreground",
                  )}
                >
                  <Video className="h-3 w-3" />
                  {isSenderAvailable ? "Émetteur prêt" : "Émetteur hors ligne"}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Émetteur {title}</p>
                  <p className="text-muted-foreground">
                    {isSenderAvailable
                      ? "L'émetteur est connecté et prêt à diffuser."
                      : "L'émetteur n'est pas connecté au serveur."}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
            {/* OBS Receiver Status */}
            {obsReceiverId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1.5 cursor-help",
                      isObsConnected
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                        : "text-muted-foreground",
                    )}
                  >
                    <Monitor className="h-3 w-3" />
                    {isObsConnected ? "OBS prêt" : "OBS hors ligne"}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">Récepteur OBS</p>
                    <p className="text-muted-foreground">
                      {isObsConnected
                        ? "Le récepteur OBS est connecté et prêt à recevoir le flux."
                        : "Le récepteur OBS n'est pas connecté au serveur."}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            {/* WebRTC Streaming Status */}
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
          {/* Video Area */}
          <div className="group relative aspect-video bg-muted overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isMuted}
              className="h-full w-full object-contain transition-all duration-300"
              style={
                isLoading
                  ? { filter: "blur(8px)", transform: "scale(1.05)" }
                  : undefined
              }
            />

            {/* Loading overlay with blur */}
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40">
                <Loader2 className="h-10 w-10 animate-spin text-white" />
                <p className="text-sm text-white font-medium">
                  {isLoading === "starting"
                    ? "Démarrage du flux..."
                    : "Arrêt du flux..."}
                </p>
              </div>
            )}

            {/* No signal overlay - show when no stream OR not connected */}
            {(!stream || !isConnected) && !isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted">
                <div className="rounded-full bg-muted-foreground/10 p-5">
                  <VideoOff className="h-10 w-10 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {noSignalMessage ?? `En attente du flux ${title}...`}
                </p>
              </div>
            )}

            {/* Live indicator */}
            {isConnected && stream && !isLoading && (
              <Badge className="absolute left-3 top-3 gap-1.5 border-red-500/30 bg-red-500/10 text-red-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                En direct
              </Badge>
            )}

            {/* Exit Fullscreen Button - Only visible in fullscreen (for mobile) */}
            {isFullscreen && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-3 top-3 h-10 w-10 rounded-full bg-black/50 text-white hover:bg-black/70"
                onClick={handleFullscreen}
              >
                <Minimize2 className="h-5 w-5" />
              </Button>
            )}
          </div>

          {/* Control Bar - Below video like SenderDashboard */}
          <div className="border-t p-2 space-y-2">
            {/* Buttons row */}
            <div className="flex items-center justify-center gap-2">
              {/* Remote Stream Control - Play/Stop/Loading states */}
              {onStreamControl && (
                <>
                  {/* Loading state */}
                  {isLoading && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block">
                          <Button
                            size="icon"
                            className="h-10 w-10 rounded-full"
                            disabled
                          >
                            <Loader2 className="h-5 w-5 animate-spin" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isLoading === "starting"
                          ? "Démarrage en cours..."
                          : "Arrêt en cours..."}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Play button - when not connected and not loading */}
                  {!isConnected && !isLoading && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block">
                          <Button
                            size="icon"
                            className="h-10 w-10 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                            onClick={() => onStreamControl("start")}
                            disabled={!isSenderAvailable || !isObsConnected}
                          >
                            <Play className="h-5 w-5" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {!isSenderAvailable
                          ? `${title} non disponible`
                          : !isObsConnected
                            ? "OBS non disponible"
                            : `Démarrer ${title}`}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Stop button - when connected and not loading */}
                  {isConnected && !isLoading && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-10 w-10 rounded-full border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                            onClick={() => onStreamControl("stop")}
                          >
                            <Square className="h-5 w-5" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Arrêter {title}</TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}

              {/* Volume Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-10 w-10 rounded-full shrink-0",
                      isMuted
                        ? "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                        : "hover:bg-muted",
                    )}
                    onClick={handleToggleMute}
                    disabled={!stream}
                  >
                    <VolumeIcon className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isMuted ? "Activer le son" : "Couper le son"}
                </TooltipContent>
              </Tooltip>

              {/* Volume Slider */}
              {stream && (
                <div className="flex-1 max-w-40">
                  <Slider
                    value={[volume]}
                    onValueChange={handleVolumeChange}
                    min={0}
                    max={100}
                    step={1}
                    className="cursor-pointer"
                  />
                </div>
              )}

              {/* Fullscreen Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full hover:bg-muted"
                    onClick={handleFullscreen}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-5 w-5" />
                    ) : (
                      <Maximize2 className="h-5 w-5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isFullscreen ? "Quitter le plein écran" : "Plein écran"}
                </TooltipContent>
              </Tooltip>

              {/* Stream Uptime */}
              <StreamUptime isStreaming={isConnected} size="sm" />
            </div>

            {/* Audio Level Meter - Separate row */}
            {stream && (
              <div
                className="transition-opacity px-2"
                style={{ opacity: isMuted ? 0.4 : 1 }}
              >
                <AudioLevelMeter
                  stream={stream}
                  size="md"
                  accentColor={accentColor}
                />
              </div>
            )}
          </div>
        </div>

        {/* Stats Bar - only shown when showInlineStats is true */}
        {isConnected && showInlineStats && (
          <div className="border-t p-3 space-y-3">
            {/* Quality Progress */}
            <Progress
              value={qualityScore}
              className={cn("h-1", styles.progress)}
            />

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
        )}
      </CardContent>
    </Card>
  );
}
