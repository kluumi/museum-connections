import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface VideoPreviewProps {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  accentColor?: "nantes" | "paris";
  className?: string;
}

const borderColors = {
  nantes: "border-[var(--nantes)]/30",
  paris: "border-[var(--paris)]/30",
};

export function VideoPreview({
  stream,
  muted = true,
  mirrored = true,
  accentColor = "nantes",
  className,
}: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      className={cn(
        "relative w-full max-w-[900px] overflow-hidden rounded-xl border-2 bg-black shadow-2xl",
        borderColors[accentColor],
        className,
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={cn(
          "aspect-video w-full object-contain",
          mirrored && "scale-x-[-1]",
        )}
      />
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-muted-foreground">Aucun flux vidéo</p>
        </div>
      )}
    </div>
  );
}
