import { Loader2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface FullscreenVideoProps {
  stream: MediaStream | null;
  className?: string;
}

export function FullscreenVideo({ stream, className }: FullscreenVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    if (videoRef.current && stream) {
      console.log(
        "🎬 Setting video srcObject, tracks:",
        stream.getTracks().map((t) => `${t.kind}:${t.readyState}`),
      );
      videoRef.current.srcObject = stream;

      // Force play in case autoplay doesn't work
      videoRef.current.play().catch((err) => {
        console.warn("⚠️ Autoplay failed:", err.message);
      });
    }
  }, [stream]);

  const handleClick = useCallback(() => {
    if (isMuted && videoRef.current) {
      videoRef.current.muted = false;
      setIsMuted(false);
    }
  }, [isMuted]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: div is needed to wrap video element for fullscreen layout
    <div
      role="button"
      tabIndex={0}
      aria-label={isMuted ? "Cliquez pour activer le son" : "Vidéo en cours"}
      className={cn(
        "relative h-screen w-screen cursor-pointer bg-black",
        className,
      )}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className="h-full w-full object-contain"
      />

      {/* Click to unmute overlay */}
      {isMuted && stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="flex flex-col items-center gap-4">
            <VolumeX className="h-16 w-16 text-white" />
            <p className="text-lg text-white">Cliquez pour activer le son</p>
          </div>
        </div>
      )}

      {/* No stream - loading spinner */}
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            <p className="text-lg text-muted-foreground">
              En attente du flux...
            </p>
          </div>
        </div>
      )}

      {/* Muted indicator in corner when stream is active but muted */}
      {isMuted && stream && (
        <div className="absolute bottom-4 right-4 rounded-full bg-black/70 p-3">
          <VolumeX className="h-6 w-6 text-white" />
        </div>
      )}
    </div>
  );
}
