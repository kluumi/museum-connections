import { useCallback, useEffect, useRef, useState } from "react";
import { VOX_DUCKING_CONFIG } from "@/config/webrtc";
import type { NodeId } from "@/constants";
import type { SignalingService } from "@/services/signaling-service";

export interface UseVoxControllerOptions {
  /** Whether VOX control is enabled */
  enabled?: boolean;
  /** Audio level threshold to trigger ducking (0-1) */
  activationThreshold?: number;
  /** Audio level threshold to release ducking (0-1) */
  deactivationThreshold?: number;
  /** Time to wait before releasing ducking (ms) */
  holdTime?: number;
  /** Gain level to apply when ducked (0-1) */
  duckedGain?: number;
  /** Interval for checking audio levels (ms) */
  checkInterval?: number;
}

export interface UseVoxControllerReturn {
  /** Whether VOX is currently triggered (local audio detected) */
  isTriggered: boolean;
  /** Current audio level being monitored (0-1) */
  audioLevel: number;
  /** Manually trigger ducking on remote */
  triggerDucking: () => void;
  /** Manually release ducking on remote */
  releaseDucking: () => void;
}

/**
 * Hook to control VOX (Voice-Operated Switch) ducking
 *
 * Monitors the local audio stream and sends ducking commands
 * to the remote party when local speech is detected.
 *
 * Flow:
 * 1. Monitor local microphone audio level
 * 2. When level exceeds activation threshold -> send "duck" to remote
 * 3. When level drops below deactivation threshold for holdTime -> send "unduck"
 *
 * Uses hysteresis (different activation/deactivation thresholds) to prevent
 * rapid toggling at the threshold boundary.
 */
export function useVoxController(
  localStream: MediaStream | null,
  signaling: SignalingService | null,
  targetNodeId: NodeId,
  options: UseVoxControllerOptions = {},
): UseVoxControllerReturn {
  const {
    enabled = true,
    activationThreshold = VOX_DUCKING_CONFIG.activationThreshold,
    deactivationThreshold = VOX_DUCKING_CONFIG.deactivationThreshold,
    holdTime = VOX_DUCKING_CONFIG.holdTime,
    duckedGain = VOX_DUCKING_CONFIG.duckedGain,
    checkInterval = VOX_DUCKING_CONFIG.checkInterval,
  } = options;

  const [isTriggered, setIsTriggered] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs for audio analysis
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationRef = useRef<number | null>(null);

  // Refs for ducking state machine
  const isDuckingActiveRef = useRef(false);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentStateRef = useRef<boolean | null>(null);

  // Track the current audio track ID
  const audioTrackId = localStream?.getAudioTracks()[0]?.id ?? null;

  // Cleanup function
  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    dataArrayRef.current = null;
    isDuckingActiveRef.current = false;
    lastSentStateRef.current = null;
  }, []);

  // Send ducking command to remote (with deduplication)
  const sendDuckingCommand = useCallback(
    (ducking: boolean) => {
      // Deduplicate: don't send the same state twice
      if (lastSentStateRef.current === ducking) {
        return;
      }

      if (!signaling || !signaling.isConnected) {
        console.warn(
          "🎙️ VOX: Cannot send ducking command - signaling not connected",
        );
        return;
      }

      console.log(
        `🎙️ VOX: Sending ${ducking ? "DUCK" : "UNDUCK"} to ${targetNodeId}`,
      );
      signaling.sendAudioDucking(targetNodeId, ducking, duckedGain);
      lastSentStateRef.current = ducking;
    },
    [signaling, targetNodeId, duckedGain],
  );

  // Manual trigger (for testing or PTT mode)
  const triggerDucking = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    isDuckingActiveRef.current = true;
    setIsTriggered(true);
    sendDuckingCommand(true);
  }, [sendDuckingCommand]);

  // Manual release
  const releaseDucking = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    isDuckingActiveRef.current = false;
    setIsTriggered(false);
    sendDuckingCommand(false);
  }, [sendDuckingCommand]);

  // Setup audio monitoring
  useEffect(() => {
    if (!localStream || !enabled) {
      cleanup();
      setAudioLevel(0);
      setIsTriggered(false);
      return;
    }

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log("🎙️ VOX: No audio tracks in stream");
      return;
    }

    console.log(
      "🎙️ VOX: Setting up audio monitoring for track:",
      audioTracks[0].label,
    );

    // Create audio context and analyser
    const audioContext = new AudioContext();

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    const source = audioContext.createMediaStreamSource(localStream);
    source.connect(analyser);
    // Don't connect to destination - we just want to analyze

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    sourceRef.current = source;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    let lastUpdate = 0;

    // Animation loop to check audio levels
    const checkLevel = (timestamp: number) => {
      if (!analyserRef.current || !dataArrayRef.current) return;

      // Throttle to checkInterval
      if (timestamp - lastUpdate >= checkInterval) {
        lastUpdate = timestamp;

        analyserRef.current.getByteTimeDomainData(dataArrayRef.current);

        // Calculate RMS level
        let sum = 0;
        for (let i = 0; i < dataArrayRef.current.length; i++) {
          const sample = (dataArrayRef.current[i] - 128) / 128;
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / dataArrayRef.current.length);
        const level = Math.min(1, rms * 3); // Same amplification as useAudioLevel

        setAudioLevel(level);

        // VOX state machine
        if (!isDuckingActiveRef.current) {
          // Not currently ducking - check for activation
          if (level >= activationThreshold) {
            console.log(
              `🎙️ VOX: Speech detected (level: ${level.toFixed(2)} >= ${activationThreshold})`,
            );
            isDuckingActiveRef.current = true;
            setIsTriggered(true);
            sendDuckingCommand(true);

            // Clear any pending release
            if (holdTimeoutRef.current) {
              clearTimeout(holdTimeoutRef.current);
              holdTimeoutRef.current = null;
            }
          }
        } else {
          // Currently ducking - check for deactivation
          if (level < deactivationThreshold) {
            // Start hold timer if not already started
            if (!holdTimeoutRef.current) {
              holdTimeoutRef.current = setTimeout(() => {
                console.log(`🎙️ VOX: Speech ended (held for ${holdTime}ms)`);
                isDuckingActiveRef.current = false;
                setIsTriggered(false);
                sendDuckingCommand(false);
                holdTimeoutRef.current = null;
              }, holdTime);
            }
          } else {
            // Level is still above deactivation threshold - cancel hold timer
            if (holdTimeoutRef.current) {
              clearTimeout(holdTimeoutRef.current);
              holdTimeoutRef.current = null;
            }
          }
        }
      }

      animationRef.current = requestAnimationFrame(checkLevel);
    };

    animationRef.current = requestAnimationFrame(checkLevel);

    return () => {
      cleanup();
    };
  }, [
    localStream,
    audioTrackId,
    enabled,
    activationThreshold,
    deactivationThreshold,
    holdTime,
    checkInterval,
    sendDuckingCommand,
    cleanup,
  ]);

  // Release ducking when component unmounts or stream changes
  useEffect(() => {
    return () => {
      if (isDuckingActiveRef.current && signaling?.isConnected) {
        console.log("🎙️ VOX: Releasing ducking on cleanup");
        signaling.sendAudioDucking(targetNodeId, false, 1);
      }
    };
  }, [signaling, targetNodeId]);

  return {
    isTriggered,
    audioLevel,
    triggerDucking,
    releaseDucking,
  };
}
