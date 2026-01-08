import {
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  Square,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { AudioLevelMeter } from "@/components/shared/AudioLevelMeter";
import { StreamUptime } from "@/components/shared/StreamUptime";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface VideoControlBarProps {
  /** Video stream for audio meter */
  stream: MediaStream | null;
  /** Whether the stream is connected (for uptime display) */
  isConnected: boolean;
  /** Whether fullscreen mode is active */
  isFullscreen: boolean;
  /** Callback to toggle fullscreen */
  onToggleFullscreen: () => void;
  /** Accent color for audio meter */
  accentColor: "nantes" | "paris";
  /** Title for tooltips (e.g., "Nantes") */
  title: string;
  /** Whether sender is available for stream control */
  isSenderAvailable?: boolean;
  /** Whether OBS receiver is available */
  isObsConnected?: boolean;
  /** Callback for stream control actions */
  onStreamControl?: (action: "start" | "stop") => void;
  /** Loading state for stream control */
  isLoading?: "starting" | "stopping" | false;
  /** Callback when mute state changes */
  onMuteChange?: (isMuted: boolean) => void;
  /** Callback when volume changes (0-100) */
  onVolumeChange?: (volume: number) => void;
}

/**
 * Control bar with volume, fullscreen, and optional stream control buttons.
 */
export function VideoControlBar({
  stream,
  isConnected,
  isFullscreen,
  onToggleFullscreen,
  accentColor,
  title,
  isSenderAvailable = false,
  isObsConnected = false,
  onStreamControl,
  isLoading = false,
  onMuteChange,
  onVolumeChange,
}: VideoControlBarProps) {
  const [volume, setVolume] = useState(0); // 0-100, starts muted
  const previousVolumeRef = useRef(50);

  const isMuted = volume === 0;
  const VolumeIcon = isMuted ? VolumeX : volume < 50 ? Volume1 : Volume2;

  const handleToggleMute = useCallback(() => {
    if (volume === 0) {
      const newVolume = previousVolumeRef.current || 50;
      setVolume(newVolume);
      onMuteChange?.(false);
      onVolumeChange?.(newVolume);
    } else {
      previousVolumeRef.current = volume;
      setVolume(0);
      onMuteChange?.(true);
      onVolumeChange?.(0);
    }
  }, [volume, onMuteChange, onVolumeChange]);

  const handleVolumeChange = useCallback(
    (values: number[]) => {
      const newVolume = values[0];
      const wasMuted = volume === 0;
      const willBeMuted = newVolume === 0;
      setVolume(newVolume);
      if (newVolume > 0) {
        previousVolumeRef.current = newVolume;
      }
      if (wasMuted !== willBeMuted) {
        onMuteChange?.(willBeMuted);
      }
      onVolumeChange?.(newVolume);
    },
    [volume, onMuteChange, onVolumeChange],
  );

  return (
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
              onClick={onToggleFullscreen}
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
  );
}

export type { VideoControlBarProps };
