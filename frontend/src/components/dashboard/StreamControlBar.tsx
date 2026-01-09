// StreamControlBar - Play/Stop button, mic toggle, audio meter, fullscreen, uptime
// Pattern: Extracted from SenderDashboard for better modularity

import {
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Play,
  Square,
} from "lucide-react";
import { AudioLevelMeter } from "@/components/shared/AudioLevelMeter";
import { StreamUptime } from "@/components/shared/StreamUptime";
import { VoxBadge } from "@/components/shared/VoxBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConnectionState } from "@/constants/connection-states";
import { cn } from "@/lib/utils";

interface StreamControlBarProps {
  // Stream state
  isStreaming: boolean;
  streamLoading: boolean;
  streamLoadingType: "starting" | "stopping" | null;
  streamStartTime: number | null;

  // WebRTC state
  webrtcConnectionState: ConnectionState;

  // Media
  localStream: MediaStream | null;
  selectedCameraId: string | null;
  isAudioEnabled: boolean;

  // VOX Ducking state
  isDucked?: boolean;
  isVoxTriggered?: boolean;

  // OBS availability
  isObsConnected: boolean;
  isSignalingConnected: boolean;

  // UI state
  isFullscreen: boolean;

  // Styling
  accentColor: "nantes" | "paris";
  targetCity: string;
  buttonStyles: string;

  // Actions
  onStartStream: () => void;
  onStopStream: () => void;
  onToggleAudio: () => void;
  onToggleFullscreen: () => void;
}

export function StreamControlBar({
  isStreaming,
  streamLoading,
  streamLoadingType,
  streamStartTime,
  webrtcConnectionState,
  localStream,
  selectedCameraId,
  isAudioEnabled,
  isDucked = false,
  isVoxTriggered = false,
  isObsConnected,
  isSignalingConnected,
  isFullscreen,
  accentColor,
  targetCity,
  buttonStyles,
  onStartStream,
  onStopStream,
  onToggleAudio,
  onToggleFullscreen,
}: StreamControlBarProps) {
  const isWebRTCConnected = webrtcConnectionState === ConnectionState.CONNECTED;
  const isWebRTCConnecting =
    webrtcConnectionState === ConnectionState.CONNECTING ||
    webrtcConnectionState === ConnectionState.RECONNECTING;

  return (
    <div className="flex items-center justify-center gap-2 border-t p-2">
      {/* Play/Stop Button - based on actual WebRTC connection state */}
      {(() => {
        // Show loading button during explicit transitions OR when streaming but WebRTC reconnecting
        // The second case handles page refresh: state is "streaming" but WebRTC is still connecting
        if (streamLoading || (isStreaming && isWebRTCConnecting)) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Button
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    disabled
                    aria-label={
                      streamLoadingType === "stopping"
                        ? "Arrêt en cours"
                        : "Connexion en cours"
                    }
                  >
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {streamLoadingType === "stopping"
                  ? "Arrêt en cours..."
                  : "Connexion en cours..."}
              </TooltipContent>
            </Tooltip>
          );
        }

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                {!isWebRTCConnected && !isStreaming ? (
                  <Button
                    size="icon"
                    className={cn("h-10 w-10 rounded-full", buttonStyles)}
                    onClick={onStartStream}
                    disabled={
                      !isSignalingConnected ||
                      !selectedCameraId ||
                      !isObsConnected
                    }
                    aria-label={`Diffuser vers ${targetCity}`}
                  >
                    <Play className="h-5 w-5" />
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-10 w-10 rounded-full border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                        aria-label="Arrêter la diffusion"
                      >
                        <Square className="h-5 w-5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Arrêter le flux ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Voulez-vous vraiment arrêter la diffusion ? Cette
                          action interrompra le flux en direct.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={onStopStream}>
                          Confirmer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {!isWebRTCConnected
                ? !selectedCameraId
                  ? "Sélectionnez une caméra"
                  : !isObsConnected
                    ? `${targetCity} OBS non disponible`
                    : `Diffuser vers ${targetCity}`
                : "Arrêter la diffusion"}
            </TooltipContent>
          </Tooltip>
        );
      })()}

      {/* Mic Toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 rounded-full",
              isAudioEnabled
                ? "hover:bg-muted"
                : "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive",
            )}
            onClick={onToggleAudio}
            aria-label={
              isAudioEnabled ? "Désactiver le micro" : "Activer le micro"
            }
          >
            {isAudioEnabled ? (
              <Mic className="h-5 w-5" />
            ) : (
              <MicOff className="h-5 w-5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isAudioEnabled ? "Désactiver le micro" : "Activer le micro"}
        </TooltipContent>
      </Tooltip>

      {/* Audio Level Meter - Inline with controls */}
      {localStream && (
        <div className={cn("flex-1 max-w-48", !isAudioEnabled && "opacity-50")}>
          <AudioLevelMeter
            stream={localStream}
            size="sm"
            accentColor={accentColor}
          />
        </div>
      )}

      {/* VOX Ducking Indicators - Always reserve space to prevent layout shift */}
      <div className="flex gap-1 shrink-0 w-[120px] justify-end">
        {isVoxTriggered && <VoxBadge type="speaking" />}
        {isDucked && <VoxBadge type="muted" />}
      </div>

      {/* Fullscreen Toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full hover:bg-muted"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
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
      <StreamUptime
        isStreaming={isStreaming}
        startTime={streamStartTime ?? undefined}
        size="sm"
      />
    </div>
  );
}
