import { useCallback, useEffect, useRef, useState } from "react";

interface UseAudioLevelOptions {
  /** Update interval in ms (default: 50ms for smooth animation) */
  interval?: number;
  /** FFT size for frequency analysis (default: 256) */
  fftSize?: number;
  /** Smoothing time constant 0-1 (default: 0.8) */
  smoothingTimeConstant?: number;
}

interface AudioLevelState {
  /** Current audio level 0-1 */
  level: number;
  /** Peak level 0-1 (decays over time) */
  peak: number;
  /** Whether audio is clipping (level > 0.95) */
  isClipping: boolean;
}

/**
 * Hook to measure audio levels from a MediaStream using Web Audio API
 * Returns normalized level (0-1) suitable for VU meter display
 */
export function useAudioLevel(
  stream: MediaStream | null,
  options: UseAudioLevelOptions = {},
): AudioLevelState {
  const { interval = 50, fftSize = 256, smoothingTimeConstant = 0.8 } = options;

  const [state, setState] = useState<AudioLevelState>({
    level: 0,
    peak: 0,
    isClipping: false,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const animationRef = useRef<number | null>(null);
  const peakRef = useRef(0);
  const peakDecayRef = useRef<number | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (peakDecayRef.current) {
      clearInterval(peakDecayRef.current);
      peakDecayRef.current = null;
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
    peakRef.current = 0;
  }, []);

  useEffect(() => {
    if (!stream) {
      cleanup();
      setState({ level: 0, peak: 0, isClipping: false });
      return;
    }

    // Check if stream has audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log("🔇 No audio tracks in stream");
      return;
    }

    // Create audio context and analyser
    const audioContext = new AudioContext();

    // Resume audio context if suspended (required for autoplay policy)
    // Also add a listener for user interaction to resume if needed
    const resumeContext = () => {
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }
    };
    resumeContext();

    // Add listeners for user interaction to resume the context
    document.addEventListener("click", resumeContext, { once: true });
    document.addEventListener("keydown", resumeContext, { once: true });

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = smoothingTimeConstant;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    // Don't connect to destination - we don't want to play audio, just analyze

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    sourceRef.current = source;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    // Clean up event listeners on unmount
    const cleanupListeners = () => {
      document.removeEventListener("click", resumeContext);
      document.removeEventListener("keydown", resumeContext);
    };

    // Peak decay timer - decay peak by 2% every 100ms
    peakDecayRef.current = window.setInterval(() => {
      peakRef.current = Math.max(0, peakRef.current * 0.98);
    }, 100);

    let lastUpdate = 0;

    // Animation loop to read audio levels
    const updateLevel = (timestamp: number) => {
      if (!analyserRef.current || !dataArrayRef.current) return;

      // Throttle updates to specified interval
      if (timestamp - lastUpdate >= interval) {
        lastUpdate = timestamp;

        analyserRef.current.getByteTimeDomainData(dataArrayRef.current);

        // Calculate RMS (Root Mean Square) for accurate level
        let sum = 0;
        for (let i = 0; i < dataArrayRef.current.length; i++) {
          const sample = (dataArrayRef.current[i] - 128) / 128; // Normalize to -1 to 1
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / dataArrayRef.current.length);

        // Convert to 0-1 range with some amplification for better visual response
        // RMS of speech is typically 0.1-0.3, so multiply by ~3 for good meter range
        const level = Math.min(1, rms * 3);

        // Update peak
        if (level > peakRef.current) {
          peakRef.current = level;
        }

        setState({
          level,
          peak: peakRef.current,
          isClipping: level > 0.95,
        });
      }

      animationRef.current = requestAnimationFrame(updateLevel);
    };

    animationRef.current = requestAnimationFrame(updateLevel);

    return () => {
      cleanupListeners();
      cleanup();
    };
  }, [stream, interval, fftSize, smoothingTimeConstant, cleanup]);

  return state;
}
