import { useCallback, useEffect, useRef, useState } from "react";
import { VOX_DUCKING_CONFIG } from "@/config/webrtc";
import type { SenderNodeId } from "@/constants";
import { NodeId as NodeIds } from "@/constants";

export interface UseVoxDuckingOptions {
  /** Whether VOX ducking is enabled */
  enabled?: boolean;
  /** Audio level threshold to trigger ducking (0-1) */
  activationThreshold?: number;
  /** Audio level threshold to release ducking (0-1) */
  deactivationThreshold?: number;
  /** Time to wait before releasing ducking (ms) */
  holdTime?: number;
  /** Gain level to apply when ducked (0-1) */
  duckedGain?: number;
}

export interface UseVoxDuckingReturn {
  /** Whether local VOX is triggered (we are speaking) */
  isVoxTriggered: boolean;
  /** Whether we are being ducked (remote is speaking) */
  isDucked: boolean;
  /** Current local audio level (0-1) */
  localAudioLevel: number;
  /** Current gain applied to our audio (0-1, 1 = full volume) */
  currentGain: number;
  /** Handle incoming ducking command from remote */
  handleDuckingCommand: (ducking: boolean, gain: number) => void;
  /** Send ducking command to remote (call this from VOX detection) */
  sendDuckingToRemote: (ducking: boolean) => void;
}

/**
 * Get the remote sender target for VOX ducking
 * Nantes -> Paris, Paris -> Nantes
 */
export function getRemoteSenderTarget(nodeId: SenderNodeId): SenderNodeId {
  return nodeId === NodeIds.NANTES ? NodeIds.PARIS : NodeIds.NANTES;
}

/**
 * Combined hook for VOX (Voice-Operated Switch) ducking
 *
 * This hook handles both:
 * 1. VOX detection - monitoring local audio and triggering when speech is detected
 * 2. Ducking reception - applying gain reduction when remote party is speaking
 *
 * The gain reduction is applied via a callback that the parent component
 * uses to modify the audio track before WebRTC transmission.
 */
export function useVoxDucking(
  localStream: MediaStream | null,
  options: UseVoxDuckingOptions = {},
): UseVoxDuckingReturn {
  const {
    enabled = true,
    activationThreshold = VOX_DUCKING_CONFIG.activationThreshold,
    deactivationThreshold = VOX_DUCKING_CONFIG.deactivationThreshold,
    holdTime = VOX_DUCKING_CONFIG.holdTime,
    duckedGain = VOX_DUCKING_CONFIG.duckedGain,
  } = options;

  // State
  const [isVoxTriggered, setIsVoxTriggered] = useState(false);
  const [isDucked, setIsDucked] = useState(false);
  const [localAudioLevel, setLocalAudioLevel] = useState(0);
  const [currentGain, setCurrentGain] = useState(1);

  // Refs for audio analysis
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const animationRef = useRef<number | null>(null);

  // Refs for VOX state machine
  const isVoxActiveRef = useRef(false);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Callback refs (set by parent)
  const sendDuckingRef = useRef<((ducking: boolean) => void) | null>(null);

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
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
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
    isVoxActiveRef.current = false;
  }, []);

  // Handle incoming ducking command
  const handleDuckingCommand = useCallback((ducking: boolean, gain: number) => {
    console.log(
      `🎚️ VOX: Received ${ducking ? "DUCK" : "UNDUCK"} command (gain: ${gain})`,
    );
    setIsDucked(ducking);
    setCurrentGain(ducking ? gain : 1);

    // Apply gain change to the audio context if available
    if (gainNodeRef.current && audioContextRef.current) {
      const now = audioContextRef.current.currentTime;
      const fadeTime = VOX_DUCKING_CONFIG.fadeTime / 1000;
      const targetGain = ducking ? Math.max(0.001, gain) : 1;

      gainNodeRef.current.gain.cancelScheduledValues(now);
      gainNodeRef.current.gain.setValueAtTime(
        gainNodeRef.current.gain.value,
        now,
      );
      gainNodeRef.current.gain.exponentialRampToValueAtTime(
        targetGain,
        now + fadeTime,
      );
    }
  }, []);

  // Send ducking command to remote (wrapper for parent callback)
  const sendDuckingToRemote = useCallback((ducking: boolean) => {
    sendDuckingRef.current?.(ducking);
  }, []);

  // Setup audio monitoring and gain control
  useEffect(() => {
    if (!localStream || !enabled) {
      cleanup();
      setLocalAudioLevel(0);
      setIsVoxTriggered(false);
      setIsDucked(false);
      setCurrentGain(1);
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

    // Create audio context
    const audioContext = new AudioContext();

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    // Create nodes
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1;

    const source = audioContext.createMediaStreamSource(localStream);

    // Connect: source -> analyser (for level detection, no output)
    source.connect(analyser);
    // Note: We don't connect to destination - this is just for monitoring
    // The actual gain control is handled separately in the WebRTC pipeline

    // Store refs
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    gainNodeRef.current = gainNode;
    sourceRef.current = source;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    let lastUpdate = 0;
    const checkInterval = VOX_DUCKING_CONFIG.checkInterval;

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
        const level = Math.min(1, rms * 3);

        setLocalAudioLevel(level);

        // VOX state machine
        if (!isVoxActiveRef.current) {
          // Not currently triggered - check for activation
          if (level >= activationThreshold) {
            console.log(
              `🎙️ VOX: Speech detected (level: ${level.toFixed(2)} >= ${activationThreshold})`,
            );
            isVoxActiveRef.current = true;
            setIsVoxTriggered(true);
            sendDuckingRef.current?.(true);

            // Clear any pending release
            if (holdTimeoutRef.current) {
              clearTimeout(holdTimeoutRef.current);
              holdTimeoutRef.current = null;
            }
          }
        } else {
          // Currently triggered - check for deactivation
          if (level < deactivationThreshold) {
            // Start hold timer if not already started
            if (!holdTimeoutRef.current) {
              holdTimeoutRef.current = setTimeout(() => {
                console.log(`🎙️ VOX: Speech ended (held for ${holdTime}ms)`);
                isVoxActiveRef.current = false;
                setIsVoxTriggered(false);
                sendDuckingRef.current?.(false);
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
    duckedGain,
    cleanup,
  ]);

  return {
    isVoxTriggered,
    isDucked,
    localAudioLevel,
    currentGain,
    handleDuckingCommand,
    sendDuckingToRemote,
  };
}
