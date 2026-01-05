// useVideoSettingsSync - Synchronizes video settings changes with WebRTC connections
// Pattern: Extracted from SenderDashboard to reduce monolith complexity
//
// This hook handles both:
// 1. Initial settings application when stream first becomes available
// 2. Ongoing settings changes during the session

import { useEffect, useMemo, useRef } from "react";
import { debounce } from "@/lib/utils";
import type { StreamSlice } from "@/stores";

/** Debounce delay for applying video constraints (ms) */
const CONSTRAINT_DEBOUNCE_MS = 300;

/** Debounce delay for bitrate/codec changes (ms) */
const SETTING_DEBOUNCE_MS = 150;

export interface UseVideoSettingsSyncOptions {
  videoSettings: StreamSlice["videoSettings"];
  localStream: MediaStream | null;
  isStreaming: boolean;
  applyVideoConstraints: (settings: StreamSlice["videoSettings"]) => Promise<{
    track: MediaStreamTrack;
    resolutionMatched: boolean;
  } | null>;
  addLog: (
    message: string,
    level?: "info" | "warning" | "error" | "success",
  ) => void;
  setIsVideoReady: (ready: boolean) => void;
  onTrackUpdate?: (track: MediaStreamTrack) => Promise<void>;
  // Callbacks for applying bitrate/codec changes (handled by StreamManager)
  onBitrateChange?: (bitrate: number | "auto") => void;
  onCodecChange?: (codec: string | "auto") => void;
  /**
   * If true, apply persisted settings immediately when stream becomes available.
   * This replaces the separate useInitialSettingsApply hook.
   * @default false
   */
  applyInitialSettings?: boolean;
}

/**
 * Hook that synchronizes video settings changes with the media stream and WebRTC connections.
 * Handles resolution/fps changes (track replacement), bitrate changes, and codec changes.
 *
 * Debounces expensive operations to prevent rapid-fire constraint applications
 * when user adjusts multiple settings quickly.
 *
 * When applyInitialSettings is true, also applies persisted settings immediately when
 * the stream first becomes available (replacing useInitialSettingsApply).
 */
export function useVideoSettingsSync({
  videoSettings,
  localStream,
  isStreaming,
  applyVideoConstraints,
  addLog,
  setIsVideoReady,
  onTrackUpdate,
  onBitrateChange,
  onCodecChange,
  applyInitialSettings = false,
}: UseVideoSettingsSyncOptions): void {
  const prevVideoSettingsRef = useRef(videoSettings);
  const hasAppliedInitialSettings = useRef(false);

  // Track pending constraint application to use latest settings
  const pendingSettingsRef = useRef(videoSettings);

  // Stable reference for the constraint application function
  const applyConstraintsRef = useRef(applyVideoConstraints);
  const addLogRef = useRef(addLog);
  const setIsVideoReadyRef = useRef(setIsVideoReady);
  const onTrackUpdateRef = useRef(onTrackUpdate);
  const isStreamingRef = useRef(isStreaming);

  // Keep refs updated
  useEffect(() => {
    applyConstraintsRef.current = applyVideoConstraints;
    addLogRef.current = addLog;
    setIsVideoReadyRef.current = setIsVideoReady;
    onTrackUpdateRef.current = onTrackUpdate;
    isStreamingRef.current = isStreaming;
  });

  // Debounced constraint application - uses refs to always get latest values
  const debouncedApplyConstraints = useMemo(
    () =>
      debounce(async () => {
        const settings = pendingSettingsRef.current;
        console.log("📊 Debounced: applying video constraints:", {
          resolution: settings.resolution,
          fps: settings.fps,
        });

        setIsVideoReadyRef.current(false);
        const result = await applyConstraintsRef.current(settings);
        if (result) {
          if (!result.resolutionMatched) {
            addLogRef.current(
              `${settings.resolution} non supportée`,
              "warning",
            );
          }

          // If streaming, update all WebRTC peer connections with the new track
          if (isStreamingRef.current && onTrackUpdateRef.current) {
            await onTrackUpdateRef.current(result.track);
          }
        }
      }, CONSTRAINT_DEBOUNCE_MS),
    [],
  );

  // Debounced bitrate change
  const debouncedBitrateChange = useMemo(
    () =>
      debounce((bitrate: number | "auto") => {
        console.log("📊 Debounced: bitrate changed:", bitrate);
        onBitrateChange?.(bitrate);
      }, SETTING_DEBOUNCE_MS),
    [onBitrateChange],
  );

  // Debounced codec change
  const debouncedCodecChange = useMemo(
    () =>
      debounce((codec: string | "auto") => {
        console.log("📊 Debounced: codec changed:", codec);
        onCodecChange?.(codec);
      }, SETTING_DEBOUNCE_MS),
    [onCodecChange],
  );

  // Cleanup debounced functions on unmount
  useEffect(() => {
    return () => {
      debouncedApplyConstraints.cancel();
      debouncedBitrateChange.cancel();
      debouncedCodecChange.cancel();
    };
  }, [debouncedApplyConstraints, debouncedBitrateChange, debouncedCodecChange]);

  // Apply initial persisted settings when stream first becomes available
  // This replaces the separate useInitialSettingsApply hook
  useEffect(() => {
    if (!applyInitialSettings) return;
    if (!localStream || hasAppliedInitialSettings.current) return;

    // Only apply if we have non-default resolution or fps settings
    if (videoSettings.resolution !== "auto" || videoSettings.fps !== "auto") {
      console.log("📊 Applying initial persisted settings:", {
        resolution: videoSettings.resolution,
        fps: videoSettings.fps,
      });
      hasAppliedInitialSettings.current = true;

      const doApply = async () => {
        setIsVideoReadyRef.current(false);
        const result = await applyConstraintsRef.current(videoSettings);
        if (result && !result.resolutionMatched) {
          addLogRef.current(
            `${videoSettings.resolution} non supportée`,
            "warning",
          );
        }
      };
      doApply();
    } else {
      // Mark as done even if settings are auto
      hasAppliedInitialSettings.current = true;
    }
  }, [localStream, videoSettings, applyInitialSettings]);

  // Main effect to detect and handle settings changes
  useEffect(() => {
    const prev = prevVideoSettingsRef.current;

    // Skip if no local stream or if this is the initial mount
    if (!localStream || !prev) {
      prevVideoSettingsRef.current = videoSettings;
      return;
    }

    // Check what changed
    const resolutionChanged = prev.resolution !== videoSettings.resolution;
    const fpsChanged = prev.fps !== videoSettings.fps;
    const bitrateChanged = prev.bitrate !== videoSettings.bitrate;
    const codecChanged = prev.codec !== videoSettings.codec;

    // Update ref AFTER comparison
    prevVideoSettingsRef.current = videoSettings;

    // Handle resolution/fps changes - debounce track replacement
    if (resolutionChanged || fpsChanged) {
      console.log(
        "📊 Resolution/FPS change detected, scheduling debounced apply",
      );
      pendingSettingsRef.current = videoSettings;
      debouncedApplyConstraints();
    }

    // Handle bitrate changes (only when streaming)
    if (isStreaming && bitrateChanged) {
      debouncedBitrateChange(videoSettings.bitrate);
    }

    // Handle codec changes (only when streaming)
    if (isStreaming && codecChanged) {
      debouncedCodecChange(videoSettings.codec);
    }
  }, [
    videoSettings,
    localStream,
    isStreaming,
    debouncedApplyConstraints,
    debouncedBitrateChange,
    debouncedCodecChange,
  ]);
}
