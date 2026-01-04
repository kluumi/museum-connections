import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ControlButtonsProps {
  isStreaming: boolean;
  isAudioOnly: boolean;
  targetCity: "Paris" | "Nantes";
  accentColor?: "nantes" | "paris";
  onStartStream: () => void;
  onStopStream: () => void;
  onToggleAudioOnly: () => void;
  onFullscreen: () => void;
  disabled?: boolean;
  className?: string;
}

const primaryButtonStyles = {
  nantes: "bg-red-600 hover:bg-red-500",
  paris: "bg-[var(--paris)] hover:brightness-110 text-black",
};

export function ControlButtons({
  isStreaming,
  isAudioOnly,
  targetCity,
  accentColor = "nantes",
  onStartStream,
  onStopStream,
  onToggleAudioOnly,
  onFullscreen,
  disabled = false,
  className,
}: ControlButtonsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {!isStreaming ? (
        <Button
          size="lg"
          className={cn(
            "rounded-full px-8 py-6 text-lg font-bold transition-transform hover:scale-105",
            primaryButtonStyles[accentColor],
          )}
          onClick={onStartStream}
          disabled={disabled}
        >
          ENVOYER LE FLUX VERS {targetCity.toUpperCase()}
        </Button>
      ) : (
        <Button
          size="lg"
          variant="destructive"
          className="rounded-full px-8 py-6 text-lg font-bold transition-transform hover:scale-105"
          onClick={onStopStream}
          disabled={disabled}
        >
          ARRÊTER LE FLUX
        </Button>
      )}

      <Button
        variant="secondary"
        className={cn(
          "rounded-full",
          isAudioOnly && "ring-2 ring-[var(--status-pending)]",
        )}
        onClick={onToggleAudioOnly}
        disabled={disabled}
      >
        Mode Audio Seul
      </Button>

      <Button
        variant="secondary"
        className="rounded-full"
        onClick={onFullscreen}
      >
        Plein Écran
      </Button>
    </div>
  );
}
