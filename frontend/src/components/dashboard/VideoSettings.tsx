import { Zap } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { CameraCapabilities } from "@/stores/devicesSlice";
import type {
  VideoBitrate,
  VideoCodec,
  VideoFps,
  VideoResolution,
  VideoSettings as VideoSettingsType,
} from "@/types/webrtc";

interface VideoSettingsProps {
  settings: VideoSettingsType;
  onSettingsChange: (settings: Partial<VideoSettingsType>) => void;
  cameraCapabilities?: CameraCapabilities | null;
  disabled?: boolean;
  className?: string;
}

// All possible resolution options (fallback when no capabilities detected)
const ALL_RESOLUTION_OPTIONS: {
  value: VideoResolution;
  label: string;
  width: number;
  height: number;
}[] = [
  { value: "1080p", label: "1080p", width: 1920, height: 1080 },
  { value: "720p", label: "720p", width: 1280, height: 720 },
  { value: "480p (16:9)", label: "480p (16:9)", width: 854, height: 480 },
  { value: "VGA (4:3)", label: "VGA (4:3)", width: 640, height: 480 },
  { value: "360p", label: "360p", width: 640, height: 360 },
  { value: "QVGA", label: "QVGA", width: 320, height: 240 },
];

// Standard FPS options (used as fallback when no capabilities detected)
const STANDARD_FPS_OPTIONS: { value: VideoFps; label: string; fps: number }[] =
  [
    { value: 60, label: "60 fps", fps: 60 },
    { value: 30, label: "30 fps", fps: 30 },
    { value: 25, label: "25 fps", fps: 25 },
    { value: 24, label: "24 fps", fps: 24 },
    { value: 15, label: "15 fps", fps: 15 },
  ];

const bitrateOptions: { value: VideoBitrate; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: 8000, label: "8 Mbps" },
  { value: 5000, label: "5 Mbps" },
  { value: 3000, label: "3 Mbps" },
  { value: 2000, label: "2 Mbps" },
  { value: 1000, label: "1 Mbps" },
  { value: 500, label: "500 kbps" },
];

const codecOptions: { value: VideoCodec; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "VP8", label: "VP8" },
  { value: "VP9", label: "VP9" },
  { value: "H264", label: "H.264" },
];

function SettingRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Select
        value={String(value)}
        onValueChange={(v) => {
          const option = options.find((o) => String(o.value) === v);
          if (option) onChange(option.value);
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-[120px] h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={String(option.value)} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function VideoSettings({
  settings,
  onSettingsChange,
  cameraCapabilities,
  disabled = false,
  className,
}: VideoSettingsProps) {
  const isAutoMode = settings.mode === "auto";
  const controlsDisabled = disabled || isAutoMode;

  // Filter resolution options based on camera capabilities
  const resolutionOptions = useMemo(() => {
    const autoOption = { value: "auto" as VideoResolution, label: "Auto" };

    if (!cameraCapabilities) {
      // No capabilities detected, show all options
      return [
        autoOption,
        ...ALL_RESOLUTION_OPTIONS.map(({ value, label }) => ({ value, label })),
      ];
    }

    // Use the supportedResolutions from capabilities (these are filtered by the hook)
    const { supportedResolutions } = cameraCapabilities;

    if (supportedResolutions && supportedResolutions.length > 0) {
      // Map to options using the label as both value and display
      const options = supportedResolutions.map((res) => ({
        value: res.label as VideoResolution,
        label: res.label,
      }));
      return [autoOption, ...options];
    }

    // Fallback: filter by max dimensions
    const { maxWidth, maxHeight } = cameraCapabilities;
    const filtered = ALL_RESOLUTION_OPTIONS.filter(
      (opt) => opt.width <= maxWidth && opt.height <= maxHeight,
    ).map(({ value, label }) => ({ value, label }));

    // If no resolutions match, show at least the lowest one
    if (filtered.length === 0) {
      return [
        autoOption,
        { value: "480p (4:3)" as VideoResolution, label: "480p (4:3)" },
      ];
    }

    return [autoOption, ...filtered];
  }, [cameraCapabilities]);

  // Build FPS options based on camera capabilities
  const fpsOptions = useMemo(() => {
    const autoOption = { value: "auto" as VideoFps, label: "Auto" };

    if (!cameraCapabilities) {
      // No capabilities detected, show standard options
      return [
        autoOption,
        ...STANDARD_FPS_OPTIONS.map(({ value, label }) => ({ value, label })),
      ];
    }

    const { maxFrameRate, supportedFrameRates } = cameraCapabilities;

    // If we have a list of supported frame rates from the camera, use those
    if (supportedFrameRates && supportedFrameRates.length > 0) {
      const options = supportedFrameRates
        .sort((a, b) => b - a) // Sort descending
        .map((fps) => ({ value: fps as VideoFps, label: `${fps} fps` }));
      return [autoOption, ...options];
    }

    // Fallback: filter standard options by max frame rate
    const filtered = STANDARD_FPS_OPTIONS.filter(
      (opt) => opt.fps <= maxFrameRate,
    ).map(({ value, label }) => ({ value, label }));

    // If no fps match, show at least 15fps
    if (filtered.length === 0) {
      return [autoOption, { value: 15 as VideoFps, label: "15 fps" }];
    }

    return [autoOption, ...filtered];
  }, [cameraCapabilities]);

  // Get the current FPS value, defaulting to "auto" if the current value is not in available options
  const currentFps = useMemo(() => {
    if (settings.fps === "auto") return "auto";
    // Check if current fps is in the available options
    const isAvailable = fpsOptions.some((opt) => opt.value === settings.fps);
    return isAvailable ? settings.fps : "auto";
  }, [settings.fps, fpsOptions]);

  // Get the current resolution value, defaulting to "auto" if the current value is not in available options
  const currentResolution = useMemo(() => {
    if (settings.resolution === "auto") return "auto";
    // Check if current resolution is in the available options
    const isAvailable = resolutionOptions.some(
      (opt) => opt.value === settings.resolution,
    );
    return isAvailable ? settings.resolution : "auto";
  }, [settings.resolution, resolutionOptions]);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Auto Mode Toggle */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <Label htmlFor="auto-mode" className="text-sm font-medium">
            Mode Auto
          </Label>
          {isAutoMode && (
            <Badge
              variant="secondary"
              className="bg-amber-500/10 text-amber-500 text-xs"
            >
              Adaptatif
            </Badge>
          )}
        </div>
        <Switch
          id="auto-mode"
          checked={isAutoMode}
          onCheckedChange={(checked) =>
            onSettingsChange({ mode: checked ? "auto" : "manual" })
          }
          disabled={disabled}
        />
      </div>

      {/* Manual Settings */}
      <div
        className={cn("divide-y rounded-lg border", isAutoMode && "opacity-50")}
      >
        <SettingRow
          label="Résolution"
          value={currentResolution}
          options={resolutionOptions}
          onChange={(resolution) => {
            console.log("🎯 Resolution dropdown changed to:", resolution);
            onSettingsChange({ resolution });
          }}
          disabled={controlsDisabled}
        />
        <SettingRow
          label="Framerate"
          value={currentFps}
          options={fpsOptions}
          onChange={(fps) => onSettingsChange({ fps })}
          disabled={controlsDisabled}
        />
        <SettingRow
          label="Bitrate Max"
          value={settings.bitrate}
          options={bitrateOptions}
          onChange={(bitrate) => onSettingsChange({ bitrate })}
          disabled={controlsDisabled}
        />
        <SettingRow
          label="Codec"
          value={settings.codec}
          options={codecOptions}
          onChange={(codec) => onSettingsChange({ codec })}
          disabled={controlsDisabled}
        />
      </div>

      {isAutoMode && (
        <p className="text-xs text-muted-foreground">
          WebRTC ajuste automatiquement la qualité selon la bande passante
        </p>
      )}

      {/* FPS limitation warning for high resolutions */}
      {!isAutoMode &&
        settings.resolution === "1080p" &&
        settings.fps !== "auto" &&
        (settings.fps as number) > 30 && (
          <p className="text-xs text-amber-500 bg-amber-500/10 rounded px-2 py-1">
            ⚠️ La plupart des webcams USB sont limitées à 30 fps en 1080p.
            Essayez 720p pour atteindre {settings.fps} fps.
          </p>
        )}
    </div>
  );
}
