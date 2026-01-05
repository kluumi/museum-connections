// SenderHeader - Header with title, subtitle, and settings trigger
// Pattern: Extracted from SenderDashboard for better modularity

import { cn } from "@/lib/utils";
import type { CameraCapabilities } from "@/stores";
import type { VideoSettings } from "@/types";
import { SenderSettingsSheet } from "./SenderSettingsSheet";

interface SenderHeaderProps {
  // City display
  cityEmoji: string;
  cityName: string;
  accentColor: "nantes" | "paris";

  // Settings sheet state
  isSettingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;

  // Device data for settings sheet
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  selectedCameraId: string | null;
  selectedMicrophoneId: string | null;
  onSelectCamera: (id: string | null) => void;
  onSelectMicrophone: (id: string | null) => void;

  // Audio state
  isAudioEnabled: boolean;

  // Video settings
  videoSettings: VideoSettings;
  onVideoSettingsChange: (settings: Partial<VideoSettings>) => void;
  cameraCapabilities: CameraCapabilities | null;

  // Reset action
  onReset: () => void;
}

const accentStyles = {
  nantes: {
    header: "text-primary",
    headerBg: "bg-primary/10",
  },
  paris: {
    header: "text-primary",
    headerBg: "bg-primary/10",
  },
};

export function SenderHeader({
  cityEmoji,
  cityName,
  accentColor,
  isSettingsOpen,
  onSettingsOpenChange,
  cameras,
  microphones,
  selectedCameraId,
  selectedMicrophoneId,
  onSelectCamera,
  onSelectMicrophone,
  isAudioEnabled,
  videoSettings,
  onVideoSettingsChange,
  cameraCapabilities,
  onReset,
}: SenderHeaderProps) {
  const styles = accentStyles[accentColor];

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Title */}
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                styles.headerBg,
              )}
            >
              <span className="text-xl">{cityEmoji}</span>
            </div>
            <div className="min-w-0">
              <h1 className={cn("text-lg font-semibold", styles.header)}>
                {cityName}
              </h1>
              <p className="text-xs text-muted-foreground">
                Console de diffusion
              </p>
            </div>
          </div>

          {/* Right: Settings Drawer */}
          <div className="flex items-center gap-2">
            <SenderSettingsSheet
              open={isSettingsOpen}
              onOpenChange={onSettingsOpenChange}
              cameras={cameras}
              microphones={microphones}
              selectedCameraId={selectedCameraId}
              selectedMicrophoneId={selectedMicrophoneId}
              onSelectCamera={onSelectCamera}
              onSelectMicrophone={onSelectMicrophone}
              isAudioEnabled={isAudioEnabled}
              videoSettings={videoSettings}
              onVideoSettingsChange={onVideoSettingsChange}
              cameraCapabilities={cameraCapabilities}
              onReset={onReset}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
