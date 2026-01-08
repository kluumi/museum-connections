import { Loader2, Minimize2, VideoOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface VideoWithOverlaysProps {
  stream: MediaStream | null;
  isConnected: boolean;
  isMuted: boolean;
  /** Volume level 0-100 */
  volume: number;
  isLoading: "starting" | "stopping" | false;
  isFullscreen: boolean;
  noSignalMessage?: string;
  title: string;
  onExitFullscreen: () => void;
}

/**
 * Video element with loading, no-signal, and live overlays.
 */
export function VideoWithOverlays({
  stream,
  isConnected,
  isMuted,
  volume,
  isLoading,
  isFullscreen,
  noSignalMessage,
  title,
  onExitFullscreen,
}: VideoWithOverlaysProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      if (stream) {
        console.log(
          `🎬 VideoWithOverlays: assigned stream with ${stream.getTracks().length} tracks`,
        );
      } else {
        console.log(`🎬 VideoWithOverlays: cleared video srcObject`);
      }
    }
  }, [stream]);

  // Apply volume to video element
  useEffect(() => {
    if (videoRef.current) {
      // HTML video volume is 0.0-1.0, our volume is 0-100
      videoRef.current.volume = volume / 100;
    }
  }, [volume]);

  return (
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
          onClick={onExitFullscreen}
        >
          <Minimize2 className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}
