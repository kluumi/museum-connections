import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConsoleLog,
  createLogEntry,
  type LogEntry,
} from "@/components/shared/ConsoleLog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VOX_DUCKING_CONFIG } from "@/config/webrtc";
import { ConnectionState } from "@/constants/connection-states";
import {
  NODE_PRIMARY_TARGET,
  NodeId,
  type SenderNodeId,
} from "@/constants/node-ids";
import { useCameraChange } from "@/hooks/useCameraChange";
import { useConnectionLogging } from "@/hooks/useConnectionLogging";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useMicrophoneChange } from "@/hooks/useMicrophoneChange";
import { useStreamManager } from "@/hooks/useStreamManager";
import { useStreamState } from "@/hooks/useStreamState";
import { useUserMedia } from "@/hooks/useUserMedia";
import { useVideoSettingsSync } from "@/hooks/useVideoSettingsSync";
import { getRemoteSenderTarget } from "@/hooks/useVoxDucking";
import { getErrorMessage, handleError } from "@/lib/errors";
import { eventBus } from "@/lib/events";
import { useSettingsStore, useStore } from "@/stores";
import { SenderBlockedOverlay } from "./SenderBlockedOverlay";
import { SenderHeader } from "./SenderHeader";
import { SenderMainContent } from "./SenderMainContent";
import { StatsPanel } from "./StatsPanel";

interface SenderDashboardProps {
  nodeId: SenderNodeId;
  accentColor: "nantes" | "paris";
  cityEmoji: string;
  cityName: string;
}

export function SenderDashboard({
  nodeId,
  accentColor,
  cityEmoji,
  cityName,
}: SenderDashboardProps) {
  // Device management - selectCamera/selectMicrophone handle persistence and capability detection
  // Must be called before video settings since settings depend on selectedCameraId
  const {
    cameras,
    microphones,
    cameraCapabilities,
    selectedCameraId,
    selectedMicrophoneId,
    enumerateDevices,
    selectCamera,
    selectMicrophone: setSelectedMicrophone,
    error: devicesError,
  } = useMediaDevices({ nodeId });

  // Direct store access for setting camera without capability detection
  // Used when we already have an initial stream from enumerateDevices
  const setSelectedCameraDirectly = useStore((s) => s.setSelectedCamera);

  // Persisted settings - use per-device video settings (keyed by nodeId + cameraId)
  const {
    getPersistedVideoSettings,
    setPersistedVideoSettings,
    getSelectedDevices,
    setSelectedDevices,
    getStreamingState,
    setStreamingState,
    voxSettings,
  } = useSettingsStore();

  // Get audio enabled state from persisted settings
  const isAudioEnabled = getSelectedDevices(nodeId).isAudioEnabled;
  // Video settings for current camera on this node (returns defaults if no camera selected)
  const videoSettings = getPersistedVideoSettings(nodeId, selectedCameraId);
  const setVideoSettings = useCallback(
    (settings: Partial<typeof videoSettings>) => {
      console.log("🔧 setVideoSettings called:", {
        nodeId,
        selectedCameraId,
        settings,
      });
      setPersistedVideoSettings(nodeId, selectedCameraId, settings);
    },
    [nodeId, selectedCameraId, setPersistedVideoSettings],
  );

  // Refs for StreamManager syncing (set after stream is created)
  const streamManagerRef = useRef<ReturnType<typeof useStreamManager> | null>(
    null,
  );

  // Stream state machine - SINGLE SOURCE OF TRUTH for stream lifecycle
  // Callbacks sync StreamManager and localStorage automatically
  const streamState = useStreamState({
    onStreamingStateChange: useCallback(
      (isStreaming: boolean) => {
        // Sync StreamManager internal state
        streamManagerRef.current?.setStreamingState(isStreaming);
      },
      [], // streamManagerRef is stable
    ),
    persistState: useCallback(
      (isStreaming: boolean) => {
        // Persist to localStorage for auto-restart on page refresh
        setStreamingState(nodeId, isStreaming);
      },
      [nodeId, setStreamingState],
    ),
  });
  const {
    isStreaming,
    isLoading: streamLoading,
    loadingType: streamLoadingType,
    state: { startedAt: streamStartTime },
    stateRef: streamStateRef,
  } = streamState;

  // Fullscreen state
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  // Local state
  // isInitializing: true until enumerateDevices() completes (permission granted and devices enumerated)
  // isLoadingCamera: true while camera is being acquired for preview
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoadingCamera, setIsLoadingCamera] = useState(true); // Start true - we're loading on mount
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  // Initial stream from enumerateDevices - used to avoid extra getUserMedia call on first camera selection
  const [initialStream, setInitialStream] = useState<MediaStream | null>(null);
  // VOX Ducking state
  const [isDucked, setIsDucked] = useState(false);
  const [isVoxTriggered, setIsVoxTriggered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Logging helper
  const addLog = useCallback(
    (message: string, level: LogEntry["level"] = "info") => {
      setLogs((prev) => [...prev.slice(-100), createLogEntry(message, level)]);
    },
    [],
  );

  // Log device enumeration errors (permission denied, etc.)
  useEffect(() => {
    if (devicesError) {
      console.error("❌ Device enumeration error:", devicesError);
      addLog(`Erreur périphériques: ${devicesError.message}`, "error");
    }
  }, [devicesError, addLog]);

  // Get primary target for metrics and connection status
  const primaryTarget = NODE_PRIMARY_TARGET[nodeId];
  const targetCity = nodeId === NodeId.NANTES ? "Paris" : "Nantes";

  // Refs for state tracking
  const localStreamRef = useRef<MediaStream | null>(null);
  const selectedCameraIdRef = useRef(selectedCameraId);
  const hasAutoStarted = useRef(false);
  const isAutoRestartInProgress = useRef(false); // Prevents race conditions during auto-restart

  // Refs for remote control callbacks (set after handlers are defined)
  const startStreamRef = useRef<(() => void) | null>(null);
  const stopStreamRef = useRef<(() => void) | null>(null);
  // Queue for pending remote control actions received before handlers are ready
  const pendingControlAction = useRef<"start" | "stop" | null>(null);

  // Remote sender target for VOX ducking (Nantes -> Paris, Paris -> Nantes)
  const remoteSenderTarget = getRemoteSenderTarget(nodeId);

  // Stream manager - handles all signaling and WebRTC connections
  const stream = useStreamManager({
    nodeId,
    obsTarget: primaryTarget,
    targetCity,
    onStreamControl: (action) => {
      if (action === "start") {
        addLog("Démarrage demandé par l'opérateur", "info");
        if (startStreamRef.current) {
          if (streamStateRef.current.status === "idle") {
            startStreamRef.current();
          }
        } else {
          // Handler not ready yet - queue for later
          console.log(
            "📹 Remote start requested but handler not ready, queuing...",
          );
          pendingControlAction.current = "start";
        }
      } else if (action === "stop") {
        addLog("Arrêt demandé par l'opérateur", "warning");
        if (stopStreamRef.current) {
          if (streamStateRef.current.status === "streaming") {
            stopStreamRef.current();
          }
        } else {
          // Handler not ready yet - queue for later
          console.log(
            "📹 Remote stop requested but handler not ready, queuing...",
          );
          pendingControlAction.current = "stop";
        }
      }
    },
    onAudioDucking: (ducking, gain) => {
      // Received ducking command from remote sender
      console.log(
        `🎚️ VOX: ${ducking ? "DUCKED" : "UNDUCKED"} by remote (gain: ${gain})`,
      );
      setIsDucked(ducking);

      // Apply gain to local audio track
      if (localStreamRef.current) {
        const audioTracks = localStreamRef.current.getAudioTracks();
        for (const track of audioTracks) {
          // Use track constraints to adjust gain (limited browser support)
          // For now, we'll mute/unmute based on ducking with gain threshold
          if (ducking && gain < 0.5) {
            // Heavy ducking - reduce to near-mute
            track.enabled = gain > 0.01;
          } else {
            track.enabled = isAudioEnabled;
          }
        }
      }
    },
    addLog,
  });

  // Keep streamManagerRef in sync for useStreamState callbacks
  streamManagerRef.current = stream;

  // Auto-connect signaling on mount
  useEffect(() => {
    stream.connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.connect]);

  // Listen for duplicate sender block event and clear on successful login
  useEffect(() => {
    const unsubBlocked = eventBus.on("signaling:blocked", (data) => {
      if (data.nodeId === nodeId && data.reason === "already_connected") {
        setBlockedMessage(data.message);
      }
    });

    // Clear blocked state if login succeeds (after refresh when other tab is closed)
    const unsubLoginSuccess = eventBus.on("signaling:login_success", (data) => {
      if (data.nodeId === nodeId) {
        setBlockedMessage(null);
      }
    });

    return () => {
      unsubBlocked();
      unsubLoginSuccess();
    };
  }, [nodeId]);

  // User media - pass video settings for constraint application
  const {
    stream: localStream,
    start: startMedia,
    stop: stopMedia,
    replaceVideoTrack,
    replaceAudioTrack,
    applyVideoConstraints,
    adoptStream,
  } = useUserMedia({ videoSettings });

  // Keep refs in sync
  useEffect(() => {
    localStreamRef.current = localStream;
    // Update stream manager when local stream changes
    stream.setLocalStream(localStream);
  }, [localStream, stream.setLocalStream]);

  useEffect(() => {
    selectedCameraIdRef.current = selectedCameraId;
  }, [selectedCameraId]);

  // Update stream manager video settings when they change
  useEffect(() => {
    stream.setVideoSettings(videoSettings);
  }, [videoSettings, stream.setVideoSettings]);

  // Clear initial stream callback - memoized to avoid effect re-runs
  const clearInitialStream = useCallback(() => {
    setInitialStream(null);
  }, []);

  // Handle camera selection: start preview on first selection, hot-swap when streaming
  useCameraChange({
    nodeId,
    selectedCameraId,
    selectedMicrophoneId,
    isStreaming,
    cameras,
    videoRef,
    localStreamRef,
    startMedia,
    replaceVideoTrack,
    applyVideoConstraints,
    updateAllConnectionTracks: stream.replaceVideoTrack,
    setIsVideoReady,
    setIsLoadingCamera,
    addLog,
    // Pass initial stream for optimization - avoids extra getUserMedia on first camera selection
    initialStream,
    clearInitialStream,
    adoptStream,
  });

  // Handle microphone selection changes
  useMicrophoneChange({
    selectedMicrophoneId,
    selectedCameraId,
    isStreaming,
    microphones,
    videoRef,
    localStreamRef,
    startMedia,
    replaceAudioTrack,
    updateAllConnectionTracks: stream.replaceAudioTrack,
    setIsVideoReady,
    setIsLoadingCamera,
    addLog,
  });

  // Apply video settings when they change (works for both preview and streaming)
  // applyInitialSettings: true applies persisted settings when stream first becomes available
  useVideoSettingsSync({
    videoSettings,
    localStream,
    isStreaming,
    applyVideoConstraints,
    addLog,
    setIsVideoReady,
    onTrackUpdate: stream.replaceVideoTrack,
    onBitrateChange: stream.applyBitrateToAll,
    onCodecChange: stream.applyCodecToAll,
    applyInitialSettings: true,
  });

  // Clean up MediaStream tracks on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        console.log("🧹 Stopping MediaStream tracks on unmount");
        for (const track of localStreamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  // Store metrics - use selector that returns the specific peer's metrics
  const metrics = useStore((s) => s.peerMetrics.get(primaryTarget) ?? null);

  // Debug: log metrics when they change
  useEffect(() => {
    if (metrics) {
      console.log("📊 StatsPanel metrics updated:", {
        peerId: primaryTarget,
        fps: metrics.video.fps,
        bitrate: metrics.video.bitrate,
        width: metrics.video.width,
        height: metrics.video.height,
        codec: metrics.video.codec,
      });
    }
  }, [metrics, primaryTarget]);

  // Connection status from stream manager
  const isSignalingConnected = stream.isSignalingConnected;
  const connectedPeers = stream.connectedPeers;
  const isObsConnected = connectedPeers.includes(primaryTarget);
  const rawWebrtcConnectionState = stream.obsConnectionState;

  // Compute effective WebRTC state for UI display
  // When we're streaming/starting but WebRTC state is still DISCONNECTED, show CONNECTING
  // This prevents briefly showing "Arrêté" during page refresh or initial connection
  const webrtcConnectionState =
    (isStreaming || streamLoading) &&
    rawWebrtcConnectionState === ConnectionState.DISCONNECTED
      ? ConnectionState.CONNECTING
      : rawWebrtcConnectionState;

  // Initialize devices on mount
  // Flow: enumerateDevices() requests permission, detects capabilities, and sets selectedCameraId
  // If an initialStream is returned, we use it directly for preview (avoiding extra getUserMedia)
  // Otherwise, useCameraChange hook triggers and starts the preview
  const hasEnumeratedDevices = useRef(false);
  useEffect(() => {
    if (hasEnumeratedDevices.current) return;
    hasEnumeratedDevices.current = true;

    const initDevices = async () => {
      console.log("📹 initDevices - starting device enumeration...");
      try {
        const { cameraId, initialStream: stream } = await enumerateDevices();
        console.log("📹 initDevices - devices enumerated, cameraId:", cameraId);
        console.log(
          "📹 initDevices - initialStream available:",
          stream ? "yes" : "no",
        );

        // OPTIMIZATION: If we have an initial stream, use it directly for preview
        // This bypasses the useCameraChange effect entirely for the first camera selection
        // and avoids an extra getUserMedia call
        if (stream && cameraId) {
          console.log(
            "📹 initDevices - using initial stream directly for preview (skipping getUserMedia)",
          );
          // 1. Adopt the stream into useUserMedia so it's tracked for future operations
          adoptStream(stream);
          // 2. Set it on the video element
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          // 3. Store it for useCameraChange to know not to call startMedia
          setInitialStream(stream);
          // 4. NOW set the camera state - useCameraChange will see the stream already exists
          //    and skip the getUserMedia call
          setSelectedCameraDirectly(cameraId);
          // 5. Mark as ready
          setIsLoadingCamera(false);
          // Log camera selection - use getState() to get fresh cameras after enumeration
          const freshCameras = useStore.getState().cameras;
          const cameraName =
            freshCameras.find((c) => c.deviceId === cameraId)?.label ||
            cameraId;
          addLog(`Caméra: ${cameraName}`, "info");
        } else if (!cameraId) {
          // No camera selected
          setIsLoadingCamera(false);
          addLog("Sélectionnez une caméra", "warning");
        }
        // If cameraId exists but no initialStream, useCameraChange will handle it
      } catch (err) {
        console.error("📹 initDevices - error:", err);
        setIsLoadingCamera(false);
      }
      setIsInitializing(false);
    };

    initDevices();
  }, [enumerateDevices, addLog, adoptStream, setSelectedCameraDirectly]);

  // Check if auto-restart is pending (was streaming before refresh, waiting for localStream)
  // If so, skip page_opened - we'll send stream_started when auto-restart completes
  const wasStreamingBeforeRefresh = getStreamingState(nodeId);
  const autoRestartPending = wasStreamingBeforeRefresh && !isStreaming;

  // Log signaling and WebRTC connection state changes
  useConnectionLogging({
    isSignalingConnected,
    notifyPageOpened: stream.notifyPageOpened,
    webrtcConnectionState,
    targetCity,
    addLog,
    skipPageOpened: autoRestartPending,
  });

  // Transition to streaming state when OBS WebRTC connects
  const hasNotifiedStarted = useRef(false);
  useEffect(() => {
    if (
      webrtcConnectionState === ConnectionState.CONNECTED &&
      streamLoadingType === "starting" &&
      !hasNotifiedStarted.current
    ) {
      hasNotifiedStarted.current = true;
      streamState.streamingStarted();
      stream.notifyStreamStarted();
    }
    if (streamLoadingType !== "starting") {
      hasNotifiedStarted.current = false;
    }
  }, [
    webrtcConnectionState,
    streamLoadingType,
    streamState,
    stream.notifyStreamStarted,
  ]);

  // Fallback: Clear loading state after timeout if signaling message doesn't arrive
  useEffect(() => {
    if (!streamLoading) return;

    const timer = setTimeout(() => {
      if (
        streamStateRef.current.status === "starting" ||
        streamStateRef.current.status === "stopping"
      ) {
        console.warn(
          `⚠️ Fallback: Clearing ${streamStateRef.current.status} loading state after timeout`,
        );
        if (streamStateRef.current.status === "starting") {
          streamState.streamingStarted();
        } else {
          streamState.streamingStopped();
        }
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [streamLoading, streamState, streamStateRef.current.status]);

  // Apply persisted bitrate and codec settings when OBS WebRTC connection is established
  const prevObsState = useRef<ConnectionState>(ConnectionState.DISCONNECTED);
  useEffect(() => {
    const currentSettings = useSettingsStore
      .getState()
      .getPersistedVideoSettings(nodeId, selectedCameraId);

    if (
      webrtcConnectionState === ConnectionState.CONNECTED &&
      prevObsState.current !== ConnectionState.CONNECTED
    ) {
      console.log("📹 OBS connected - applying persisted settings");
      stream.applySettingsToObs(currentSettings);
    }
    prevObsState.current = webrtcConnectionState;
  }, [
    webrtcConnectionState,
    nodeId,
    selectedCameraId,
    stream.applySettingsToObs,
  ]);

  // Auto-start WebRTC stream when both media and signaling are ready
  // This handles page refresh while streaming - restores the stream automatically
  //
  // Key insight: We use a simplified flow that mirrors manual start:
  // 1. Wait for signaling + localStream to be ready
  // 2. Send stream_starting → set state → create offer → send stream_started
  // This ensures operator/OBS see the correct sequence of notifications
  useEffect(() => {
    if (hasAutoStarted.current) return;

    const wasStreaming = getStreamingState(nodeId);
    if (!wasStreaming) return;

    // Need signaling connected and local stream ready
    if (!localStream || !isSignalingConnected) return;

    // Mark as started IMMEDIATELY (not in timeout) to prevent
    // the effect from running multiple times due to localStream changes
    hasAutoStarted.current = true;
    isAutoRestartInProgress.current = true; // Prevent "OBS connected" effect from firing
    console.log("📹 Auto-restart: starting stream restoration");

    // Capture stream reference for use in async function
    const capturedStream = localStream;

    const autoStart = async () => {
      try {
        // Mirror manual start flow exactly:
        // 1. Set starting state and notify
        // NOTE: streamState.startStreaming() auto-syncs to StreamManager and localStorage
        streamState.startStreaming();
        stream.notifyStreamStarting();

        // 2. We already have the stream from preview, so skip startMedia()
        // Use the captured stream reference to avoid stale closure
        // Apply mute state IMMEDIATELY to stream (before WebRTC gets it)
        const currentAudioEnabled = useSettingsStore
          .getState()
          .getSelectedDevices(nodeId).isAudioEnabled;
        for (const track of capturedStream.getAudioTracks()) {
          track.enabled = currentAudioEnabled;
        }

        localStreamRef.current = capturedStream;
        stream.setLocalStream(capturedStream);

        // CRITICAL: Set StreamManager.isStreaming=true BEFORE creating offer
        // The useStreamState callback only fires when status becomes "streaming",
        // but we need isStreaming=true NOW to respond to request_offer messages
        // that may arrive during the "starting" phase
        stream.setStreamingState(true);

        // 3. Apply video settings
        const currentSettings = useSettingsStore
          .getState()
          .getPersistedVideoSettings(nodeId, selectedCameraId);
        console.log("📹 Auto-restart: applying settings:", currentSettings);
        stream.applySettingsToObs(currentSettings);

        // 4. Create offer (or wait for request_offer if OBS not connected yet)
        // Use manager's actual state to avoid stale closure issues
        const actuallyConnected = stream.manager?.isSignalingConnected ?? false;
        if (actuallyConnected) {
          console.log("📹 Auto-restart: creating OBS offer");
          await stream.createObsOffer();
        } else {
          console.log("📹 Auto-restart: waiting for OBS to request offer");
        }

        // 5. Mark as streaming and notify
        // NOTE: streamState.streamingStarted() auto-syncs to StreamManager and localStorage
        streamState.streamingStarted();
        stream.notifyStreamStarted();
        addLog("Diffusion restaurée", "success");

        // Clear flag after a short delay to allow WebRTC state to propagate
        // This prevents the "OBS connected" effect from firing redundantly
        setTimeout(() => {
          isAutoRestartInProgress.current = false;
        }, 100);
      } catch (error) {
        isAutoRestartInProgress.current = false;
        console.error("📹 Auto-restart error:", error);
        const errorMessage = getErrorMessage(error);
        handleError(error, "Restauration du flux", addLog, {
          category: "webrtc",
        });
        // Set error state in state machine
        streamState.setError(errorMessage);
        stream.notifyStreamError("webrtc_offer_failed", errorMessage);
        stream.stopStreaming("manual");
      }
    };

    // Small delay to ensure React state has settled
    const timeoutId = setTimeout(autoStart, 50);

    // Cleanup: clear timeout on unmount to prevent state updates on unmounted component
    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    localStream,
    isSignalingConnected,
    nodeId,
    selectedCameraId,
    getStreamingState,
    streamState,
    addLog,
    stream,
  ]);

  // Update video element when stream changes
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Send offer when OBS becomes available while we're streaming
  // This handles the case where OBS connects after we've started streaming (e.g., after page refresh)
  const prevObsConnected = useRef(false);
  useEffect(() => {
    // Only trigger when OBS transitions from disconnected to connected
    const wasConnected = prevObsConnected.current;
    prevObsConnected.current = isObsConnected;

    // Skip if auto-restart is in progress - it will handle the offer
    if (isAutoRestartInProgress.current) {
      console.log("📹 OBS connected but auto-restart in progress, skipping");
      return;
    }

    // Skip if WebRTC is already connecting or connected - no need for another offer
    if (
      webrtcConnectionState === ConnectionState.CONNECTING ||
      webrtcConnectionState === ConnectionState.CONNECTED
    ) {
      return;
    }

    if (!wasConnected && isObsConnected && isStreaming && localStream) {
      console.log("📹 OBS connected while streaming, sending offer");
      // Ensure local stream is set on StreamManager
      stream.setLocalStream(localStream);
      stream.createObsOffer().catch((err) => {
        console.error("Failed to create offer for OBS:", err);
      });
    }
  }, [isObsConnected, isStreaming, localStream, stream, webrtcConnectionState]);

  // Start streaming
  const handleStartStream = useCallback(async () => {
    console.log(
      "🎬 handleStartStream called, isSignalingConnected:",
      isSignalingConnected,
    );
    try {
      // NOTE: streamState.startStreaming() auto-syncs to StreamManager and localStorage
      streamState.startStreaming();
      stream.notifyStreamStarting();
      console.log("🎬 After notifyStreamStarting, calling startMedia...");

      const mediaStream = await startMedia();
      console.log("🎬 startMedia returned:", !!mediaStream);
      if (!mediaStream) {
        throw new Error("Impossible d'accéder à la caméra/microphone");
      }

      // Apply mute state IMMEDIATELY to new stream (before WebRTC gets it)
      // This ensures the track's enabled state is correct from the start
      const currentAudioEnabled = useSettingsStore
        .getState()
        .getSelectedDevices(nodeId).isAudioEnabled;
      for (const track of mediaStream.getAudioTracks()) {
        track.enabled = currentAudioEnabled;
      }

      localStreamRef.current = mediaStream;

      // IMPORTANT: Set local stream on StreamManager BEFORE creating offer
      // This ensures the WebRTCService has the stream when it's created
      // (the useEffect that normally does this may not have run yet due to React batching)
      console.log("🎬 Setting local stream on StreamManager...");
      stream.setLocalStream(mediaStream);

      // CRITICAL: Set StreamManager.isStreaming=true BEFORE creating offer
      // The useStreamState callback only fires when status becomes "streaming",
      // but we need isStreaming=true NOW to respond to request_offer messages
      // that may arrive during the "starting" phase
      stream.setStreamingState(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Check both closure value and current manager state
      // stream.isSignalingConnected is React state (may be stale)
      // stream.manager.isSignalingConnected is the actual current state
      const reactStateConnected = stream.isSignalingConnected;
      const actuallyConnected = stream.manager?.isSignalingConnected ?? false;
      console.log("🎬 About to check isSignalingConnected:", {
        closureValue: isSignalingConnected,
        reactStateValue: reactStateConnected,
        actualManagerValue: actuallyConnected,
      });

      // Use manager's actual current state as source of truth
      if (actuallyConnected) {
        console.log("🎬 Calling createObsOffer...");
        await stream.createObsOffer();
        console.log("🎬 createObsOffer completed");
        addLog("Diffusion démarrée", "success");
      } else {
        console.log("🎬 Signaling NOT connected, skipping createObsOffer");
        addLog("En attente du serveur...", "warning");
      }
    } catch (error) {
      console.error("🎬 handleStartStream error:", error);
      const errorMessage = getErrorMessage(error);
      handleError(error, "Démarrage du flux", addLog, { category: "webrtc" });
      // Set error state in state machine
      streamState.setError(errorMessage);

      let errorType: "media_permission_denied" | "webrtc_offer_failed" =
        "webrtc_offer_failed";
      if (
        errorMessage.includes("Permission") ||
        errorMessage.includes("refusée") ||
        errorMessage.includes("caméra") ||
        errorMessage.includes("microphone")
      ) {
        errorType = "media_permission_denied";
      }

      stream.notifyStreamError(errorType, errorMessage);
      stream.stopStreaming("manual");
    }
  }, [addLog, startMedia, streamState, isSignalingConnected, stream, nodeId]);

  // Stop streaming (keeps local preview running)
  const handleStopStream = useCallback(async () => {
    // NOTE: streamState.stopStreaming() and streamingStopped() auto-sync to
    // StreamManager and localStorage via callbacks
    streamState.stopStreaming();
    stream.notifyStreamStopping();

    // stopStreaming already closes OBS and operator connections internally
    stream.stopStreaming("manual");

    hasAutoStarted.current = true;

    addLog("Diffusion arrêtée", "info");

    await new Promise((resolve) => setTimeout(resolve, 500));
    streamState.streamingStopped();
  }, [addLog, streamState, stream]);

  // Keep remote control refs in sync with handlers
  useEffect(() => {
    startStreamRef.current = handleStartStream;
    stopStreamRef.current = handleStopStream;

    // Process any pending remote control action that was queued before handlers were ready
    if (pendingControlAction.current) {
      const action = pendingControlAction.current;
      pendingControlAction.current = null;
      console.log(`📹 Processing queued remote ${action} action`);
      if (action === "start" && streamStateRef.current.status === "idle") {
        handleStartStream();
      } else if (
        action === "stop" &&
        streamStateRef.current.status === "streaming"
      ) {
        handleStopStream();
      }
    }
  }, [handleStartStream, handleStopStream, streamStateRef.current.status]);

  // Notify server when page is closed or refreshed
  useEffect(() => {
    const handlePageClose = () => {
      if (isStreaming) {
        stream.stopStreaming("page_closed");
      }
    };

    window.addEventListener("beforeunload", handlePageClose);
    window.addEventListener("pagehide", handlePageClose);

    return () => {
      window.removeEventListener("beforeunload", handlePageClose);
      window.removeEventListener("pagehide", handlePageClose);
    };
  }, [isStreaming, stream.stopStreaming]);

  // Fullscreen handler using the hook
  const handleFullscreen = useCallback(() => {
    toggleFullscreen(videoContainerRef.current);
  }, [toggleFullscreen]);

  // Reset sources (camera + microphone) - stops stream and clears selections
  const handleResetSources = useCallback(() => {
    if (localStream) {
      stopMedia();
    }
    if (isStreaming) {
      // NOTE: streamState.reset() auto-syncs to StreamManager and localStorage
      streamState.reset();
      stream.stopStreaming("manual");
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    // Reset video state
    setIsVideoReady(false);
    setIsLoadingCamera(false);
    // Clear device selections
    selectCamera(null);
    setSelectedMicrophone(null);
  }, [
    localStream,
    isStreaming,
    stopMedia,
    selectCamera,
    setSelectedMicrophone,
    streamState,
    stream,
  ]);

  // Reset video settings to defaults (all "auto")
  const handleResetVideoSettings = useCallback(() => {
    setVideoSettings({
      mode: "manual",
      resolution: "auto",
      fps: "auto",
      bitrate: "auto",
      codec: "auto",
    });
  }, [setVideoSettings]);

  // Toggle audio enabled/disabled
  const handleToggleAudio = useCallback(() => {
    const newEnabled = !isAudioEnabled;
    setSelectedDevices(nodeId, { isAudioEnabled: newEnabled });

    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      for (const track of audioTracks) {
        track.enabled = newEnabled;
      }
    }
  }, [isAudioEnabled, nodeId, setSelectedDevices, localStream]);

  // Apply audio enabled state when stream starts or isAudioEnabled changes
  useEffect(() => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      for (const track of audioTracks) {
        track.enabled = isAudioEnabled;
      }
    }
  }, [localStream, isAudioEnabled]);

  // VOX Monitoring - detect local speech and send ducking commands to remote sender
  // Only enabled for Nantes (to duck Paris) since Paris environment is too noisy
  useEffect(() => {
    // Only enable VOX for Nantes
    if (nodeId !== NodeId.NANTES) return;
    if (!localStream || !isStreaming || !stream.isSignalingConnected) return;

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    console.log("🎙️ VOX: Starting audio monitoring for", nodeId);

    // Create audio context for level monitoring
    const audioContext = new AudioContext();
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    const source = audioContext.createMediaStreamSource(localStream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let isVoxActive = false;
    let holdTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastSentState: boolean | null = null;
    let animationId: number | null = null;
    let lastUpdate = 0;

    // Use voxSettings from store (reactive to changes)
    const { activationThreshold, deactivationThreshold, holdTime } =
      voxSettings;
    const { checkInterval } = VOX_DUCKING_CONFIG; // checkInterval stays constant

    const sendDucking = (ducking: boolean) => {
      if (lastSentState === ducking) return;
      console.log(
        `🎙️ VOX: Sending ${ducking ? "DUCK" : "UNDUCK"} to ${remoteSenderTarget}`,
      );
      stream.sendAudioDucking(
        remoteSenderTarget,
        ducking,
        voxSettings.duckedGain,
      );
      lastSentState = ducking;
      setIsVoxTriggered(ducking);
    };

    const checkLevel = (timestamp: number) => {
      if (timestamp - lastUpdate < checkInterval) {
        animationId = requestAnimationFrame(checkLevel);
        return;
      }
      lastUpdate = timestamp;

      analyser.getByteTimeDomainData(dataArray);

      // Calculate RMS level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const sample = (dataArray[i] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = Math.min(1, rms * 3);

      // VOX state machine
      if (!isVoxActive) {
        if (level >= activationThreshold) {
          console.log(`🎙️ VOX: Speech detected (level: ${level.toFixed(2)})`);
          isVoxActive = true;
          sendDucking(true);
          if (holdTimeout) {
            clearTimeout(holdTimeout);
            holdTimeout = null;
          }
        }
      } else {
        if (level < deactivationThreshold) {
          if (!holdTimeout) {
            holdTimeout = setTimeout(() => {
              console.log(`🎙️ VOX: Speech ended`);
              isVoxActive = false;
              sendDucking(false);
              holdTimeout = null;
            }, holdTime);
          }
        } else {
          if (holdTimeout) {
            clearTimeout(holdTimeout);
            holdTimeout = null;
          }
        }
      }

      animationId = requestAnimationFrame(checkLevel);
    };

    animationId = requestAnimationFrame(checkLevel);

    return () => {
      console.log("🎙️ VOX: Stopping audio monitoring");
      if (animationId) cancelAnimationFrame(animationId);
      if (holdTimeout) clearTimeout(holdTimeout);
      // Release ducking when stopping
      if (lastSentState === true) {
        stream.sendAudioDucking(remoteSenderTarget, false, 1);
      }
      source.disconnect();
      analyser.disconnect();
      audioContext.close();
    };
  }, [
    localStream,
    isStreaming,
    stream.isSignalingConnected,
    stream.sendAudioDucking,
    nodeId,
    remoteSenderTarget,
    voxSettings,
  ]);

  // Show blocking overlay if duplicate sender detected
  if (blockedMessage) {
    return <SenderBlockedOverlay message={blockedMessage} />;
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <SenderHeader
          cityEmoji={cityEmoji}
          cityName={cityName}
          accentColor={accentColor}
          isSettingsOpen={isSettingsOpen}
          onSettingsOpenChange={setIsSettingsOpen}
          cameras={cameras}
          microphones={microphones}
          selectedCameraId={selectedCameraId}
          selectedMicrophoneId={selectedMicrophoneId}
          onSelectCamera={selectCamera}
          onSelectMicrophone={setSelectedMicrophone}
          isAudioEnabled={isAudioEnabled}
          videoSettings={videoSettings}
          onVideoSettingsChange={setVideoSettings}
          cameraCapabilities={cameraCapabilities}
          onReset={() => {
            handleResetSources();
            handleResetVideoSettings();
          }}
        />

        {/* Main Content */}
        <main className="container mx-auto space-y-4 p-4">
          {/* Video + Settings stacked vertically */}
          <SenderMainContent
            nodeId={nodeId}
            accentColor={accentColor}
            targetCity={targetCity}
            videoRef={videoRef}
            videoContainerRef={videoContainerRef}
            localStream={localStream}
            isStreaming={isStreaming}
            streamLoading={streamLoading}
            streamLoadingType={streamLoadingType}
            streamStartTime={streamStartTime}
            isVideoReady={isVideoReady}
            setIsVideoReady={setIsVideoReady}
            isInitializing={isInitializing}
            isLoadingCamera={isLoadingCamera}
            selectedCameraId={selectedCameraId}
            isSignalingConnected={isSignalingConnected}
            connectedPeers={connectedPeers}
            webrtcConnectionState={webrtcConnectionState}
            isObsConnected={isObsConnected}
            isAudioEnabled={isAudioEnabled}
            isDucked={isDucked}
            isVoxTriggered={isVoxTriggered}
            isFullscreen={isFullscreen}
            onFullscreenToggle={handleFullscreen}
            onStartStream={handleStartStream}
            onStopStream={handleStopStream}
            onToggleAudio={handleToggleAudio}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />

          {/* Stats & Console (full width) */}
          {selectedCameraId && (
            <StatsPanel metrics={metrics} isStreaming={isStreaming} />
          )}
          <ConsoleLog
            entries={logs}
            accentColor={accentColor}
            onClear={() => setLogs([])}
          />
        </main>
      </div>
    </TooltipProvider>
  );
}
