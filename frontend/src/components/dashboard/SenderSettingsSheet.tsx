// SenderSettingsSheet - Settings drawer for device and video configuration
// Pattern: Extracted from SenderDashboard for better modularity

import {
  Mic,
  MicOff,
  MonitorPlay,
  Radio,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Video,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { type CameraCapabilities, useSettingsStore } from "@/stores";
import type { VideoSettings } from "@/types";
import { DeviceSelector } from "./DeviceSelector";
import { VideoSettings as VideoSettingsPanel } from "./VideoSettings";
import { VoxSettingsPanel } from "./VoxSettingsPanel";

interface SenderSettingsSheetProps {
  // Sheet state
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Devices
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  selectedCameraId: string | null;
  selectedMicrophoneId: string | null;
  onSelectCamera: (id: string | null) => void;
  onSelectMicrophone: (id: string | null) => void;

  // Audio
  isAudioEnabled: boolean;

  // Video settings
  videoSettings: VideoSettings;
  onVideoSettingsChange: (settings: Partial<VideoSettings>) => void;
  cameraCapabilities: CameraCapabilities | null;

  // Actions
  onReset: () => void;
}

export function SenderSettingsSheet({
  open,
  onOpenChange,
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
}: SenderSettingsSheetProps) {
  // Get VOX settings from store
  const { voxSettings, setVoxSettings, resetVoxSettings } = useSettingsStore();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Paramètres">
          <SlidersHorizontal className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="p-0 flex flex-col">
        <SheetHeader className="p-4 shrink-0 border-b">
          <SheetTitle className="text-lg">Paramètres</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Sources et qualité vidéo
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <Accordion
            type="multiple"
            defaultValue={["sources", "video", "vox"]}
            className="w-full"
          >
            {/* Sources Section */}
            <AccordionItem value="sources" className="border-0 px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MonitorPlay className="h-4 w-4" />
                  Sources
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Video className="h-3.5 w-3.5" />
                      Caméra
                    </Label>
                    <DeviceSelector
                      devices={cameras}
                      selectedDeviceId={selectedCameraId}
                      onSelect={onSelectCamera}
                      disabled={false}
                      placeholder="Sélectionner une caméra"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      className={cn(
                        "flex items-center gap-2 text-xs",
                        "text-muted-foreground",
                      )}
                    >
                      {isAudioEnabled ? (
                        <Mic className="h-3.5 w-3.5" />
                      ) : (
                        <MicOff className="h-3.5 w-3.5 text-destructive" />
                      )}
                      Microphone {!isAudioEnabled && "(muet)"}
                    </Label>
                    <DeviceSelector
                      devices={microphones}
                      selectedDeviceId={selectedMicrophoneId}
                      onSelect={onSelectMicrophone}
                      disabled={false}
                      placeholder="Sélectionner un microphone"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Video Settings Section */}
            <AccordionItem value="video" className="border-0 px-4">
              <AccordionTrigger
                className={cn(
                  "hover:no-underline py-3",
                  !selectedCameraId && "opacity-50",
                )}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Settings2 className="h-4 w-4" />
                  Paramètres Vidéo
                  {!selectedCameraId && (
                    <span className="text-xs font-normal text-muted-foreground">
                      (caméra requise)
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <VideoSettingsPanel
                  settings={videoSettings}
                  onSettingsChange={onVideoSettingsChange}
                  cameraCapabilities={cameraCapabilities}
                  disabled={!selectedCameraId}
                />
              </AccordionContent>
            </AccordionItem>

            {/* VOX Ducking Settings Section */}
            <AccordionItem value="vox" className="border-0 px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Radio className="h-4 w-4" />
                  VOX Ducking
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <VoxSettingsPanel
                  settings={voxSettings}
                  onSettingsChange={setVoxSettings}
                  onReset={resetVoxSettings}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Footer */}
        <SheetFooter className="shrink-0 border-t p-4">
          <div className="flex w-full items-center justify-between">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              disabled={!selectedCameraId && !selectedMicrophoneId}
              className="gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Réinitialiser
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
