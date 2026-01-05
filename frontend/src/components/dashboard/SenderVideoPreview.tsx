// SenderVideoPreview - Local video preview with status badge, loading states, and overlays
// Pattern: Extracted from SenderDashboard for better modularity

import { Loader2, Minimize2, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectionState } from "@/constants/connection-states";
import { cn } from "@/lib/utils";

interface SenderVideoPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoContainerRef: React.RefObject<HTMLDivElement | null>;
  localStream: MediaStream | null;
  webrtcConnectionState: ConnectionState;
  isVideoReady: boolean;
  setIsVideoReady: (ready: boolean) => void;
  isInitializing: boolean;
  isLoadingCamera: boolean;
  selectedCameraId: string | null;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  onOpenSettings: () => void;
}

export function SenderVideoPreview({
  videoRef,
  videoContainerRef,
  localStream,
  webrtcConnectionState,
  isVideoReady,
  setIsVideoReady,
  isInitializing,
  isLoadingCamera,
  selectedCameraId,
  isFullscreen,
  onFullscreenToggle,
  onOpenSettings,
}: SenderVideoPreviewProps) {
  const isLive = webrtcConnectionState === ConnectionState.CONNECTED;
  const isConnecting =
    webrtcConnectionState === ConnectionState.CONNECTING ||
    webrtcConnectionState === ConnectionState.RECONNECTING;

  return (
    <div
      ref={videoContainerRef}
      className="relative aspect-video w-full bg-muted"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full scale-x-[-1] object-contain"
        style={{ backgroundColor: "transparent" }}
        onCanPlay={() => setIsVideoReady(true)}
        onPlaying={() => setIsVideoReady(true)}
      />

      {/* Streaming Status Badge */}
      {localStream && (
        <Badge
          variant="outline"
          className={cn(
            "absolute left-3 top-3 gap-1.5",
            isLive
              ? "border-red-500/30 bg-red-500/10 text-red-500"
              : isConnecting
                ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                : "border-muted-foreground/30 bg-muted text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              isLive
                ? "bg-red-500 animate-pulse"
                : isConnecting
                  ? "bg-amber-500 animate-pulse"
                  : "bg-muted-foreground",
            )}
          />
          {isLive ? "En direct" : isConnecting ? "Connexion..." : "Hors ligne"}
        </Badge>
      )}

      {/* Exit Fullscreen Button - Only visible in fullscreen (for mobile) */}
      {isFullscreen && (
        <Button
          variant="secondary"
          size="icon"
          className="absolute right-3 top-3 h-10 w-10 rounded-full bg-black/50 text-white hover:bg-black/70"
          onClick={onFullscreenToggle}
          aria-label="Quitter le plein écran"
        >
          <Minimize2 className="h-5 w-5" />
        </Button>
      )}

      {/* Loading state - non-interactive */}
      {/* Only show loading when actively loading (isInitializing or isLoadingCamera) */}
      {/* Once we have a localStream, the video should be visible even during WebRTC negotiation */}
      {(isInitializing || isLoadingCamera) && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted">
          <div className="rounded-full bg-muted-foreground/10 p-4">
            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      )}

      {/* No camera selected - interactive prompt */}
      {(!localStream || !isVideoReady) &&
        !selectedCameraId &&
        !isInitializing &&
        !isLoadingCamera && (
          // biome-ignore lint/a11y/useSemanticElements: div needed for absolute positioning overlay
          <div
            role="button"
            tabIndex={0}
            aria-label="Ouvrir les paramètres"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted cursor-pointer hover:bg-muted/80 transition-colors"
            onClick={onOpenSettings}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenSettings();
              }
            }}
          >
            <div className="rounded-full bg-muted-foreground/10 p-4">
              <Settings2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center px-4">
              Cliquez ici pour sélectionner
              <br />
              un périphérique vidéo et/ou audio
            </p>
          </div>
        )}
    </div>
  );
}
