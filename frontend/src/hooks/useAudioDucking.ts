import { useCallback, useEffect, useRef, useState } from "react";
import { VOX_DUCKING_CONFIG } from "@/config/webrtc";

export interface UseAudioDuckingOptions {
  /** Whether ducking is enabled */
  enabled?: boolean;
  /** Gain level when ducked (0-1). Default from VOX_DUCKING_CONFIG */
  duckedGain?: number;
  /** Fade time for smooth transitions (ms). Default from VOX_DUCKING_CONFIG */
  fadeTime?: number;
}

export interface UseAudioDuckingReturn {
  /** Whether ducking is currently active */
  isDucking: boolean;
  /** Current gain value (0-1) */
  currentGain: number;
  /** Apply ducking (reduce gain) */
  duck: (gain?: number) => void;
  /** Release ducking (restore full gain) */
  unduck: () => void;
  /** Get the processed MediaStream with gain control */
  processedStream: MediaStream | null;
}

/**
 * Hook to apply audio ducking (gain reduction) to a MediaStream
 *
 * Uses Web Audio API GainNode to smoothly reduce audio volume
 * when instructed by the VOX controller (remote speech detection).
 *
 * The hook creates a processed stream that can be used for WebRTC
 * transmission while the original stream remains unchanged.
 */
export function useAudioDucking(
  stream: MediaStream | null,
  options: UseAudioDuckingOptions = {},
): UseAudioDuckingReturn {
  const {
    enabled = true,
    duckedGain = VOX_DUCKING_CONFIG.duckedGain,
    fadeTime = VOX_DUCKING_CONFIG.fadeTime,
  } = options;

  const [isDucking, setIsDucking] = useState(false);
  const [currentGain, setCurrentGain] = useState(1);
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(
    null,
  );

  // Refs for Web Audio nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Track the current audio track ID to detect changes
  const audioTrackId = stream?.getAudioTracks()[0]?.id ?? null;

  // Cleanup function
  const cleanup = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    if (destinationRef.current) {
      destinationRef.current.disconnect();
      destinationRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setProcessedStream(null);
  }, []);

  // Setup audio processing pipeline
  useEffect(() => {
    if (!stream || !enabled) {
      cleanup();
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log("🔇 useAudioDucking: No audio tracks in stream");
      return;
    }

    console.log(
      "🎚️ useAudioDucking: Setting up gain control for track:",
      audioTracks[0].label,
    );

    // Create audio context
    const audioContext = new AudioContext();

    // Resume audio context if suspended
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    // Create nodes
    const source = audioContext.createMediaStreamSource(stream);
    const gainNode = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();

    // Set initial gain
    gainNode.gain.value = 1;

    // Connect: source -> gain -> destination
    source.connect(gainNode);
    gainNode.connect(destination);

    // Store refs
    audioContextRef.current = audioContext;
    gainNodeRef.current = gainNode;
    sourceRef.current = source;
    destinationRef.current = destination;

    // Create processed stream that includes:
    // 1. The processed audio track from our GainNode
    // 2. Any video tracks from the original stream (unchanged)
    const newProcessedStream = new MediaStream();

    // Add processed audio track
    for (const track of destination.stream.getAudioTracks()) {
      newProcessedStream.addTrack(track);
    }

    // Add original video tracks (if any)
    for (const track of stream.getVideoTracks()) {
      newProcessedStream.addTrack(track);
    }

    setProcessedStream(newProcessedStream);
    console.log("🎚️ useAudioDucking: Audio processing pipeline ready");

    return () => {
      cleanup();
    };
  }, [stream, audioTrackId, enabled, cleanup]);

  // Apply ducking (reduce gain)
  const duck = useCallback(
    (gain?: number) => {
      const targetGain = gain ?? duckedGain;

      if (!gainNodeRef.current || !audioContextRef.current) {
        console.warn(
          "🎚️ useAudioDucking: Cannot duck - audio context not ready",
        );
        return;
      }

      console.log(
        `🎚️ useAudioDucking: Ducking to ${(targetGain * 100).toFixed(0)}%`,
      );

      // Smooth transition using exponential ramp
      const now = audioContextRef.current.currentTime;
      gainNodeRef.current.gain.cancelScheduledValues(now);
      gainNodeRef.current.gain.setValueAtTime(
        gainNodeRef.current.gain.value,
        now,
      );
      gainNodeRef.current.gain.exponentialRampToValueAtTime(
        Math.max(0.001, targetGain), // exponentialRamp can't go to 0
        now + fadeTime / 1000,
      );

      setIsDucking(true);
      setCurrentGain(targetGain);
    },
    [duckedGain, fadeTime],
  );

  // Release ducking (restore full gain)
  const unduck = useCallback(() => {
    if (!gainNodeRef.current || !audioContextRef.current) {
      console.warn(
        "🎚️ useAudioDucking: Cannot unduck - audio context not ready",
      );
      return;
    }

    console.log("🎚️ useAudioDucking: Restoring full gain");

    // Smooth transition back to full gain
    const now = audioContextRef.current.currentTime;
    gainNodeRef.current.gain.cancelScheduledValues(now);
    gainNodeRef.current.gain.setValueAtTime(
      gainNodeRef.current.gain.value,
      now,
    );
    gainNodeRef.current.gain.exponentialRampToValueAtTime(
      1,
      now + fadeTime / 1000,
    );

    setIsDucking(false);
    setCurrentGain(1);
  }, [fadeTime]);

  return {
    isDucking,
    currentGain,
    duck,
    unduck,
    processedStream,
  };
}
