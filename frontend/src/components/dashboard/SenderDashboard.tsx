import {
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorPlay,
  Play,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Square,
  Video,
  VideoOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLevelMeter } from "@/components/shared/AudioLevelMeter";
import {
  ConsoleLog,
  createLogEntry,
  type LogEntry,
} from "@/components/shared/ConsoleLog";
import {
  ReceiverStatusBadge,
  SignalingBadge,
  WebRTCBadge,
} from "@/components/shared/StatusBadge";
import { StreamUptime } from "@/components/shared/StreamUptime";
import { ThemeToggle } from "@/components/theme";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConnectionState } from "@/constants/connection-states";
import {
  isOperatorNode,
  NODE_PRIMARY_TARGET,
  NODE_TARGETS,
  NodeId,
  type SenderNodeId,
} from "@/constants/node-ids";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useSignaling } from "@/hooks/useSignaling";
import { useStreamState } from "@/hooks/useStreamState";
import { useUserMedia } from "@/hooks/useUserMedia";
import { useWebRTC } from "@/hooks/useWebRTC";
import { getErrorMessage, handleError } from "@/lib/errors";
import { eventBus } from "@/lib/events";
import { cn } from "@/lib/utils";
import { WebRTCService } from "@/services/webrtc";
import { useSettingsStore, useStore } from "@/stores";
import { DeviceSelector } from "./DeviceSelector";
import { StatsPanel } from "./StatsPanel";
import { VideoSettings } from "./VideoSettings";

interface SenderDashboardProps {
  nodeId: SenderNodeId;
  accentColor: "nantes" | "paris";
  cityEmoji: string;
  cityName: string;
}

const accentStyles = {
  nantes: {
    header: "text-primary",
    headerBg: "bg-primary/10",
    button:
      "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
  },
  paris: {
    header: "text-primary",
    headerBg: "bg-primary/10",
    button:
      "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
  },
};

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
    selectCamera: setSelectedCamera,
    selectMicrophone: setSelectedMicrophone,
  } = useMediaDevices({ nodeId });

  // Persisted settings - use per-device video settings (keyed by nodeId + cameraId)
  const {
    getVideoSettings,
    setVideoSettings: setDeviceVideoSettings,
    getSelectedDevices,
    setSelectedDevices,
    getStreamingState,
    setStreamingState,
  } = useSettingsStore();

  // Get audio enabled state from persisted settings
  const audioEnabled = getSelectedDevices(nodeId).audioEnabled;
  // Video settings for current camera on this node (returns defaults if no camera selected)
  const videoSettings = getVideoSettings(nodeId, selectedCameraId);
  const setVideoSettings = useCallback(
    (settings: Partial<typeof videoSettings>) => {
      console.log("🔧 setVideoSettings called:", {
        nodeId,
        selectedCameraId,
        settings,
      });
      setDeviceVideoSettings(nodeId, selectedCameraId, settings);
    },
    [nodeId, selectedCameraId, setDeviceVideoSettings],
  );

  // Stream state machine - single source of truth for stream lifecycle
  const streamState = useStreamState();
  const {
    isStreaming,
    isLoading: streamLoading,
    loadingType: streamLoadingType,
    state: { startedAt: streamStartTime },
    stateRef: streamStateRef,
  } = streamState;

  // Local state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Logging helper
  const addLog = useCallback(
    (message: string, level: LogEntry["level"] = "info") => {
      setLogs((prev) => [...prev.slice(-100), createLogEntry(message, level)]);
    },
    [],
  );

  // Listen for duplicate sender block event
  useEffect(() => {
    const unsubscribe = eventBus.on("signaling:blocked", (data) => {
      if (data.nodeId === nodeId && data.reason === "already_connected") {
        setBlockedMessage(data.message);
      }
    });
    return unsubscribe;
  }, [nodeId]);

  // User media - pass video settings for constraint application
  const {
    stream: localStream,
    start: startMedia,
    stop: stopMedia,
    replaceVideoTrack,
    replaceAudioTrack,
    applyVideoConstraints,
  } = useUserMedia({ videoSettings });

  // Get all targets for WebRTC
  const targets = NODE_TARGETS[nodeId];
  const primaryTarget = NODE_PRIMARY_TARGET[nodeId];
  const targetCity = nodeId === NodeId.NANTES ? "Paris" : "Nantes";

  // Refs for WebRTC connections
  // OBS connection uses the hook, operator connections are managed imperatively
  const webrtcConnectionsRef = useRef<
    Map<NodeId, ReturnType<typeof useWebRTC>>
  >(new Map());
  // Dynamic operator connections (operator-xxx) - managed imperatively
  const operatorConnectionsRef = useRef<Map<string, WebRTCService>>(new Map());
  // Note: Stream state is tracked via streamStateRef from useStreamState hook
  const localStreamRef = useRef(localStream);
  const selectedCameraIdRef = useRef(selectedCameraId);
  const hasAutoStarted = useRef(false);

  // Refs for remote control callbacks (set after handlers are defined)
  const startStreamRef = useRef<(() => void) | null>(null);
  const stopStreamRef = useRef<(() => void) | null>(null);

  // Keep refs in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    selectedCameraIdRef.current = selectedCameraId;
  }, [selectedCameraId]);

  // Helper to update track on all WebRTC connections (OBS + operator)
  const updateAllConnectionTracks = useCallback(
    async (track: MediaStreamTrack) => {
      const obsConnections = Array.from(webrtcConnectionsRef.current.entries());
      const operatorConnections = Array.from(
        operatorConnectionsRef.current.entries(),
      );
      console.log(
        `🔄 Updating ${obsConnections.length} OBS + ${operatorConnections.length} operator connections`,
      );
      for (const [, webrtc] of obsConnections) {
        await webrtc.replaceTrack(track);
      }
      for (const [, webrtc] of operatorConnections) {
        await webrtc.replaceTrack(track);
      }
    },
    [],
  );

  // Handle camera selection: start preview on first selection, hot-swap when streaming
  // Also apply persisted video settings for the new camera
  const prevCameraIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevCameraIdRef.current;
    const cameraChanged = selectedCameraId && selectedCameraId !== prevId;
    const isFirstSelection = prevId === null && selectedCameraId !== null;

    console.log("📷 Camera effect:", {
      selectedCameraId,
      prevId,
      isStreaming,
      cameraChanged,
      isFirstSelection,
      hasLocalStream: !!localStream,
    });

    if (cameraChanged) {
      console.log(
        "📷 Camera changed from",
        prevId ?? "none",
        "to",
        selectedCameraId,
      );

      const doHandleCameraChange = async () => {
        try {
          // Reset video ready state when camera changes
          setIsVideoReady(false);
          setIsLoadingCamera(true);

          // First camera selection OR changing camera while not streaming: (re)start the preview
          if (!isStreaming) {
            console.log("📷 Camera selection - starting/restarting preview");

            const stream = await startMedia({
              cameraId: selectedCameraId ?? undefined,
              microphoneId: selectedMicrophoneId ?? undefined,
            });

            setIsLoadingCamera(false);
            if (stream && videoRef.current) {
              videoRef.current.srcObject = stream;
            }
            // Log camera change with device name
            const cameraName =
              cameras.find((c) => c.deviceId === selectedCameraId)?.label ||
              selectedCameraId;
            addLog(`Caméra changée: ${cameraName}`, "info");
          }
          // Already streaming: hot-swap the camera track
          else {
            console.log("📷 Calling replaceVideoTrack with:", selectedCameraId);
            const newTrack = await replaceVideoTrack(selectedCameraId);

            setIsLoadingCamera(false);
            if (newTrack) {
              // Update all WebRTC peer connections with the new track
              // Update all WebRTC connections with the new video track
              await updateAllConnectionTracks(newTrack);
              // Log camera change with device name
              const cameraName =
                cameras.find((c) => c.deviceId === selectedCameraId)?.label ||
                selectedCameraId;
              addLog(`Caméra changée: ${cameraName}`, "info");
            }
          }

          // Apply persisted video settings for this camera (if they exist and are not all auto)
          // Wait a bit for the stream to be ready
          await new Promise((resolve) => setTimeout(resolve, 100));

          const currentStream = localStreamRef.current;
          const persistedSettings = useSettingsStore
            .getState()
            .getVideoSettings(nodeId, selectedCameraId);

          if (
            currentStream &&
            (persistedSettings.resolution !== "auto" ||
              persistedSettings.fps !== "auto")
          ) {
            const result = await applyVideoConstraints(persistedSettings);
            if (result) {
              // Only warn if resolution wasn't available
              if (!result.resolutionMatched) {
                addLog(
                  `${persistedSettings.resolution} non supportée`,
                  "warning",
                );
              }

              // If streaming, also update WebRTC with the new settings track
              if (isStreaming) {
                await updateAllConnectionTracks(result.track);
              }
            }
          }
        } catch (err) {
          setIsLoadingCamera(false);
          handleError(err, "Changement de caméra", addLog, {
            category: "media",
          });
        }
      };

      doHandleCameraChange();
    }

    // Always update the ref to track the current selection
    prevCameraIdRef.current = selectedCameraId;
  }, [
    selectedCameraId,
    selectedMicrophoneId,
    isStreaming,
    localStream,
    nodeId,
    replaceVideoTrack,
    applyVideoConstraints,
    addLog,
    startMedia,
  ]);

  // Handle microphone selection changes
  // Similar to camera handling: restart preview when not streaming, hot-swap when streaming
  const prevMicIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevMicIdRef.current;
    // Handle mic change (including first selection)
    const micChanged = selectedMicrophoneId && selectedMicrophoneId !== prevId;

    console.log("🎤 Mic effect:", {
      selectedMicrophoneId,
      prevId,
      isStreaming,
      hasStream: !!localStream,
      micChanged,
    });

    if (micChanged) {
      const doHandleMicChange = async () => {
        try {
          // Not streaming: restart preview with new mic (need camera too for video preview)
          if (!isStreaming) {
            console.log("🎤 Mic selection - restarting preview with new mic");

            // Only restart if we have a camera selected (otherwise no preview to update)
            if (selectedCameraId) {
              const stream = await startMedia({
                cameraId: selectedCameraId,
                microphoneId: selectedMicrophoneId ?? undefined,
              });

              if (stream && videoRef.current) {
                videoRef.current.srcObject = stream;
              }
              // Log mic change with device name
              const micName =
                microphones.find((m) => m.deviceId === selectedMicrophoneId)
                  ?.label || selectedMicrophoneId;
              addLog(`Microphone changé: ${micName}`, "info");
            }
          }
          // Already streaming: hot-swap the audio track
          else {
            console.log("🎤 Hot-swapping mic to", selectedMicrophoneId);
            const newTrack = await replaceAudioTrack(selectedMicrophoneId);

            if (newTrack) {
              // Update all WebRTC peer connections with the new track
              // Update all WebRTC connections with the new audio track
              await updateAllConnectionTracks(newTrack);
              // Log mic change with device name
              const micName =
                microphones.find((m) => m.deviceId === selectedMicrophoneId)
                  ?.label || selectedMicrophoneId;
              addLog(`Microphone changé: ${micName}`, "info");
            }
          }
        } catch (err) {
          handleError(err, "Changement de microphone", addLog, {
            category: "media",
          });
        }
      };

      doHandleMicChange();
    }

    // Always update the ref to track the current selection
    prevMicIdRef.current = selectedMicrophoneId;
  }, [
    selectedMicrophoneId,
    selectedCameraId,
    isStreaming,
    localStream,
    replaceAudioTrack,
    startMedia,
    addLog,
  ]);

  // Apply persisted video settings when stream first becomes available
  // This handles the case where persisted settings exist but stream was acquired with defaults
  const hasAppliedInitialSettings = useRef(false);

  useEffect(() => {
    // Only run once when localStream first becomes available with a camera selected
    if (
      !localStream ||
      !selectedCameraId ||
      hasAppliedInitialSettings.current
    ) {
      return;
    }

    const persistedSettings = useSettingsStore
      .getState()
      .getVideoSettings(nodeId, selectedCameraId);
    console.log("📹 Initial settings check:", {
      hasStream: !!localStream,
      cameraId: selectedCameraId,
      persistedSettings,
    });

    // Only apply if we have non-default resolution or fps settings
    if (
      persistedSettings.resolution !== "auto" ||
      persistedSettings.fps !== "auto"
    ) {
      console.log("📹 Applying initial persisted settings:", persistedSettings);
      hasAppliedInitialSettings.current = true;

      const doApply = async () => {
        // Reset video ready state before applying constraints (track will change)
        setIsVideoReady(false);
        const result = await applyVideoConstraints(persistedSettings);
        if (result && !result.resolutionMatched) {
          addLog(`${persistedSettings.resolution} non supportée`, "warning");
        }
      };
      doApply();
    } else {
      // Mark as done even if settings are auto
      hasAppliedInitialSettings.current = true;
    }
  }, [localStream, selectedCameraId, nodeId, applyVideoConstraints, addLog]);

  // Apply video settings when they change (works for both preview and streaming)
  const prevVideoSettingsRef = useRef(videoSettings);

  useEffect(() => {
    const prev = prevVideoSettingsRef.current;

    console.log("📊 Video settings effect triggered:", {
      current: videoSettings,
      prev,
      hasLocalStream: !!localStream,
    });

    // Skip if no local stream (preview not started yet) or if this is the initial mount
    if (!localStream || !prev) {
      console.log("📊 Skipping - no localStream or no prev");
      prevVideoSettingsRef.current = videoSettings;
      return;
    }

    // Check if resolution or fps changed - replace track with new constraints
    const resolutionChanged = prev.resolution !== videoSettings.resolution;
    const fpsChanged = prev.fps !== videoSettings.fps;

    console.log("📊 Change detection:", {
      resolutionChanged,
      fpsChanged,
      prevRes: prev.resolution,
      newRes: videoSettings.resolution,
    });

    // Update ref AFTER comparison
    prevVideoSettingsRef.current = videoSettings;

    if (resolutionChanged || fpsChanged) {
      console.log(
        "📊 Video settings changed, replacing track with new constraints:",
        {
          resolution: videoSettings.resolution,
          fps: videoSettings.fps,
        },
      );

      const doApplyConstraints = async () => {
        // Reset video ready state before applying constraints (track will change)
        setIsVideoReady(false);
        const result = await applyVideoConstraints(videoSettings);
        if (result) {
          // Only warn if resolution wasn't available
          if (!result.resolutionMatched) {
            addLog(`${videoSettings.resolution} non supportée`, "warning");
          }

          // If streaming, update all WebRTC peer connections with the new track
          if (isStreaming) {
            await updateAllConnectionTracks(result.track);
          }
        }
      };

      doApplyConstraints();
    }

    // Check if bitrate changed - apply to all WebRTC connections (only when streaming)
    if (isStreaming && prev.bitrate !== videoSettings.bitrate) {
      console.log("📊 Bitrate changed:", videoSettings.bitrate);
      const obsConnections = Array.from(webrtcConnectionsRef.current.entries());
      const operatorConnections = Array.from(
        operatorConnectionsRef.current.entries(),
      );
      for (const [, webrtc] of obsConnections) {
        webrtc.setVideoBitrate(videoSettings.bitrate);
      }
      for (const [, webrtc] of operatorConnections) {
        webrtc.setVideoBitrate(videoSettings.bitrate);
      }
    }

    // Check if codec changed - apply to all WebRTC connections (only when streaming)
    // Note: Codec change requires renegotiation to take effect
    if (isStreaming && prev.codec !== videoSettings.codec) {
      console.log("📊 Codec changed:", videoSettings.codec);
      const obsConnections = Array.from(webrtcConnectionsRef.current.entries());
      const operatorConnections = Array.from(
        operatorConnectionsRef.current.entries(),
      );
      for (const [, webrtc] of obsConnections) {
        webrtc.setPreferredCodec(videoSettings.codec);
        // Trigger renegotiation to apply the new codec
        webrtc.createOffer().catch((err) => {
          console.warn(`⚠️ Failed to renegotiate codec:`, err);
        });
      }
      for (const [, webrtc] of operatorConnections) {
        webrtc.setPreferredCodec(videoSettings.codec);
        // Trigger renegotiation to apply the new codec
        webrtc.createOffer().catch((err) => {
          console.warn(`⚠️ Failed to renegotiate codec:`, err);
        });
      }
    }
  }, [videoSettings, localStream, isStreaming, applyVideoConstraints, addLog]);

  // Ref for signaling service (used by operator connections)
  const signalingServiceRef =
    useRef<ReturnType<typeof useSignaling>["service"]>(null);

  // Helper to get or create an operator connection
  const getOrCreateOperatorConnection = useCallback(
    (operatorId: string): WebRTCService | null => {
      const signalingService = signalingServiceRef.current;
      if (!signalingService) return null;

      // Check if we already have a connection for this operator
      let service = operatorConnectionsRef.current.get(operatorId);
      if (service) return service;

      // Create a new connection for this operator
      console.log(
        `📡 Creating new WebRTC connection for operator: ${operatorId}`,
      );
      service = new WebRTCService(
        nodeId,
        operatorId as NodeId,
        signalingService,
        {
          localStream: localStreamRef.current ?? undefined,
        },
      );
      operatorConnectionsRef.current.set(operatorId, service);

      // Apply persisted video settings to the new connection
      const currentSettings = useSettingsStore
        .getState()
        .getVideoSettings(nodeId, selectedCameraIdRef.current);
      if (currentSettings.bitrate !== "auto") {
        service.setVideoBitrate(currentSettings.bitrate);
      }
      if (currentSettings.codec !== "auto") {
        service.setPreferredCodec(currentSettings.codec);
      }

      return service;
    },
    [nodeId],
  );

  // Signaling - auto-connects on mount
  const signaling = useSignaling(nodeId, {
    autoConnect: true,
    onMessage: (message) => {
      // Handle stream_started echo - just log it, state is already transitioned
      // when OBS connects (in the effect above)
      if (message.type === "stream_started" && message.from === nodeId) {
        // State already transitioned in the OBS connection effect
        // This echo is just for debugging/confirmation
        console.log("📡 Received stream_started echo from server");
        return;
      }

      // Handle stream_stopped - transition to idle state
      // This is our own message echoed back by the server
      if (message.type === "stream_stopped" && message.from === nodeId) {
        streamState.streamingStopped();
        return;
      }

      // Handle stream_control separately (doesn't require WebRTC connection)
      if (message.type === "stream_control") {
        if (message.action === "start") {
          addLog("Démarrage demandé par l'opérateur", "info");
          // Use state ref to check current state without stale closure
          if (
            startStreamRef.current &&
            streamStateRef.current.status === "idle"
          ) {
            startStreamRef.current();
          }
        } else if (message.action === "stop") {
          addLog("Arrêt demandé par l'opérateur", "warning");
          // Use state ref to check current state without stale closure
          if (
            stopStreamRef.current &&
            streamStateRef.current.status === "streaming"
          ) {
            stopStreamRef.current();
          }
        }
        return;
      }

      // Skip messages without a sender
      if (!message.from) return;

      // Handle operator messages (dynamic IDs like operator-xxx)
      if (isOperatorNode(message.from)) {
        const operatorService = getOrCreateOperatorConnection(message.from);
        if (!operatorService) {
          console.warn(
            `⚠️ Could not create operator connection for ${message.from}: signaling service not available`,
          );
          return;
        }

        switch (message.type) {
          case "answer":
            operatorService.handleAnswer(message.answer);
            break;

          case "candidate":
            operatorService.addIceCandidate(message.candidate);
            break;

          case "request_offer": {
            const currentlyStreaming =
              streamStateRef.current.status === "streaming";
            // Skip if already connected - avoid unnecessary renegotiation
            if (operatorService.connectionState === ConnectionState.CONNECTED) {
              console.log(
                `📡 Ignoring request_offer from operator ${message.from} - already connected`,
              );
              break;
            }
            if (currentlyStreaming && localStreamRef.current) {
              console.log(
                `📡 Sending offer to operator ${message.from} upon request`,
              );
              // Update local stream if needed
              operatorService.setLocalStream(localStreamRef.current);
              // Apply codec and bitrate settings
              const currentSettings = useSettingsStore
                .getState()
                .getVideoSettings(nodeId, selectedCameraIdRef.current);
              if (currentSettings.codec !== "auto") {
                operatorService.setPreferredCodec(currentSettings.codec);
              }
              if (currentSettings.bitrate !== "auto") {
                operatorService.setVideoBitrate(currentSettings.bitrate);
              }
              operatorService.createOffer();
            } else {
              console.log(
                `⏳ Cannot send offer to operator ${message.from}: status=${streamStateRef.current.status}, hasStream=${!!localStreamRef.current}`,
              );
            }
            break;
          }
        }
        return;
      }

      // Handle peer_disconnected - close WebRTC connection immediately
      // This provides instant feedback when OBS receiver refreshes/closes
      if (message.type === "peer_disconnected") {
        const peerId = message.peer;
        // Check if it's an OBS receiver
        if (peerId === targets[0]) {
          console.log(`📡 OBS receiver ${peerId} disconnected, closing WebRTC`);
          obsWebRTC?.close();
          addLog(`${targetCity} OBS déconnecté`, "warning");
        }
        // Check if it's an operator
        if (isOperatorNode(peerId)) {
          const operatorService = operatorConnectionsRef.current.get(peerId);
          if (operatorService) {
            console.log(`📡 Operator ${peerId} disconnected, closing WebRTC`);
            operatorService.close();
            operatorConnectionsRef.current.delete(peerId);
          }
        }
        return;
      }

      // Handle OBS messages (static IDs)
      const webrtc = webrtcConnectionsRef.current.get(message.from);
      if (!webrtc?.service) return;

      switch (message.type) {
        case "answer":
          webrtc.handleAnswer(message.answer);
          break;

        case "candidate":
          webrtc.addIceCandidate(message.candidate);
          break;

        case "request_offer": {
          const currentlyStreaming =
            streamStateRef.current.status === "streaming";
          // Skip if already connected - avoid unnecessary renegotiation
          if (webrtc.connectionState === ConnectionState.CONNECTED) {
            console.log(
              `📡 Ignoring request_offer from ${message.from} - already connected`,
            );
            break;
          }
          if (currentlyStreaming && localStreamRef.current) {
            console.log(`📡 Sending offer to ${message.from} upon request`);
            const currentSettings = useSettingsStore
              .getState()
              .getVideoSettings(nodeId, selectedCameraIdRef.current);
            if (currentSettings.codec !== "auto") {
              webrtc.setPreferredCodec(currentSettings.codec);
            }
            if (currentSettings.bitrate !== "auto") {
              webrtc.setVideoBitrate(currentSettings.bitrate);
            }
            webrtc.createOffer();
          }
          break;
        }
      }
    },
  });

  // Keep signaling service ref updated synchronously (for use in callbacks)
  // This needs to be synchronous so that onMessage callbacks can access the service immediately
  signalingServiceRef.current = signaling.service;

  // WebRTC connection to OBS (static target)
  const obsWebRTC = useWebRTC(nodeId, targets[0], signaling.service, {
    localStream: localStream ?? undefined,
  });

  // Update the connections map for OBS
  webrtcConnectionsRef.current.set(targets[0], obsWebRTC);

  // Clean up operator connections when streaming stops or component unmounts
  useEffect(() => {
    return () => {
      // Close all operator connections on unmount
      for (const [id, service] of operatorConnectionsRef.current) {
        console.log(`🧹 Closing operator connection: ${id}`);
        service.close();
      }
      operatorConnectionsRef.current.clear();
    };
  }, []);

  // Update operator connections when local stream changes
  useEffect(() => {
    if (localStream) {
      for (const [, service] of operatorConnectionsRef.current) {
        service.setLocalStream(localStream);
      }
    }
  }, [localStream]);

  // Debug: log connection states
  useEffect(() => {
    console.log("📡 WebRTC connections:", {
      [targets[0]]: {
        state: obsWebRTC.connectionState,
        hasService: !!obsWebRTC.service,
      },
      operators: operatorConnectionsRef.current.size,
    });
  }, [obsWebRTC.connectionState, targets]);

  // Use primary target (OBS) for UI display
  const webrtc = obsWebRTC;

  // Store metrics - use selector that returns the specific peer's metrics
  // This ensures React re-renders when this peer's metrics update
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

  // Connection status
  const isSignalingConnected = signaling.isConnected;
  const connectedPeers = signaling.connectedPeers;
  const isObsConnected = connectedPeers.includes(primaryTarget);

  // Styles
  const styles = accentStyles[accentColor];

  // Initialize devices on mount (but don't auto-start preview - user must select camera)
  const hasEnumeratedDevices = useRef(false);
  useEffect(() => {
    if (hasEnumeratedDevices.current) return;
    hasEnumeratedDevices.current = true;

    const initDevices = async () => {
      // enumerateDevices returns the selected device IDs immediately
      // Camera will be null - user must select manually
      const { cameraId } = await enumerateDevices();
      console.log("📹 initDevices - devices enumerated");

      // If a camera was persisted, we'll be loading it
      if (cameraId) {
        setIsLoadingCamera(true);
      } else {
        addLog("Sélectionnez une caméra", "warning");
      }
      setIsInitializing(false);
    };

    initDevices();
  }, [enumerateDevices, addLog]);

  // Log signaling state changes - use ref to avoid re-running on every render
  const hasLoggedConnection = useRef(false);
  useEffect(() => {
    if (isSignalingConnected && !hasLoggedConnection.current) {
      hasLoggedConnection.current = true;
      addLog("Connecté au serveur de signalisation", "success");
      signaling.notifyPageOpened();
    } else if (!isSignalingConnected) {
      hasLoggedConnection.current = false;
    }
  }, [isSignalingConnected, signaling.notifyPageOpened, addLog]);

  // Log WebRTC connection state changes and apply persisted settings when connected
  const prevWebRTCState = useRef<ConnectionState>(ConnectionState.DISCONNECTED);
  useEffect(() => {
    const state = webrtc.connectionState;
    if (state !== prevWebRTCState.current) {
      prevWebRTCState.current = state;
      if (state === ConnectionState.CONNECTED) {
        addLog(`Connecté à ${targetCity} via WebRTC`, "success");
      } else if (state === ConnectionState.FAILED) {
        addLog("Échec de la connexion WebRTC", "error");
      }
    }
  }, [webrtc.connectionState, targetCity, addLog]);

  // Transition to streaming state when OBS WebRTC connects
  // Also notify other clients (operator) via signaling
  const hasNotifiedStarted = useRef(false);
  useEffect(() => {
    const state = webrtc.connectionState;
    if (
      state === ConnectionState.CONNECTED &&
      streamLoadingType === "starting" &&
      !hasNotifiedStarted.current
    ) {
      hasNotifiedStarted.current = true;
      // Transition to streaming immediately when OBS connects
      // Don't wait for signaling echo - it can be unreliable
      streamState.streamingStarted();
      // Also notify other clients (operator) for their UI sync
      signalingRef.current?.notifyStreamStarted();
    }
    // Reset the flag when not starting
    if (streamLoadingType !== "starting") {
      hasNotifiedStarted.current = false;
    }
  }, [webrtc.connectionState, streamLoadingType, streamState]);

  // Fallback: Clear loading state after timeout if signaling message doesn't arrive
  // This prevents the UI from getting stuck if there are network issues
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
        // Force transition based on current state
        if (streamStateRef.current.status === "starting") {
          streamState.streamingStarted(); // Assume it worked
        } else {
          streamState.streamingStopped(); // Assume it stopped
        }
      }
    }, 3000); // 3 second fallback timeout

    return () => clearTimeout(timer);
  }, [streamLoading, streamState]);

  // Apply persisted bitrate and codec settings when OBS WebRTC connection is established
  const prevObsState = useRef<ConnectionState>(ConnectionState.DISCONNECTED);
  useEffect(() => {
    const currentSettings = useSettingsStore
      .getState()
      .getVideoSettings(nodeId, selectedCameraId);

    // Apply settings to OBS connection when it connects
    if (
      obsWebRTC.connectionState === ConnectionState.CONNECTED &&
      prevObsState.current !== ConnectionState.CONNECTED
    ) {
      console.log("📹 OBS connected - applying persisted settings");
      if (currentSettings.bitrate !== "auto") {
        obsWebRTC.setVideoBitrate(currentSettings.bitrate);
      }
      if (currentSettings.codec !== "auto") {
        obsWebRTC.setPreferredCodec(currentSettings.codec);
      }
    }
    prevObsState.current = obsWebRTC.connectionState;

    // Note: Operator connections are managed imperatively and settings are applied
    // when each connection is created in getOrCreateOperatorConnection
  }, [obsWebRTC.connectionState, nodeId, selectedCameraId, obsWebRTC]);

  // Auto-start WebRTC stream when both media and signaling are ready
  // Only auto-starts if user was streaming before page refresh (persisted state)
  useEffect(() => {
    // Only auto-start once
    if (hasAutoStarted.current) return;

    // Only auto-start if user was streaming before (persisted state)
    const wasStreaming = getStreamingState(nodeId);
    if (!wasStreaming) return;

    // Wait for both local stream and signaling to be ready
    if (!localStream || !isSignalingConnected) return;

    // Wait for OBS to be connected - don't auto-start if OBS isn't ready
    // This prevents WebRTC from going to CONNECTING state when offer can't be delivered
    if (!isObsConnected) return;

    // Wait for webrtc service to be ready
    const rtc = webrtc;
    if (!rtc) return;

    hasAutoStarted.current = true;
    // Use state machine for auto-start - go directly to streaming since we're restoring
    streamState.startStreaming();
    streamState.streamingStarted();
    localStreamRef.current = localStream; // Update ref immediately for request_offer handling

    const startWebRTC = async () => {
      try {
        // Apply persisted codec and bitrate settings BEFORE creating the offer
        // This ensures the codec preference is included in the initial SDP negotiation
        const currentSettings = useSettingsStore
          .getState()
          .getVideoSettings(nodeId, selectedCameraId);
        console.log(
          "📹 Applying initial settings before offer:",
          currentSettings,
        );

        // Apply to all WebRTC connections
        const connections = webrtcConnectionsRef.current;
        for (const [peerId, webrtcService] of connections.entries()) {
          if (currentSettings.codec !== "auto") {
            webrtcService.setPreferredCodec(currentSettings.codec);
            console.log(
              `📊 Initial codec preference set for ${peerId}: ${currentSettings.codec}`,
            );
          }
          if (currentSettings.bitrate !== "auto") {
            webrtcService.setVideoBitrate(currentSettings.bitrate);
            console.log(
              `📊 Initial bitrate set for ${peerId}: ${currentSettings.bitrate}`,
            );
          }
        }

        await rtc.createOffer();
        signalingRef.current?.notifyStreamStarted();
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        handleError(error, "Connexion WebRTC", addLog, { category: "webrtc" });
        streamState.setError(errorMessage);
        // Broadcast error to operator
        signalingRef.current?.notifyStreamError(
          "webrtc_offer_failed",
          errorMessage,
        );
        signalingRef.current?.notifyStreamStopped("manual");
      }
    };

    // Small delay to ensure everything is initialized
    const timer = setTimeout(startWebRTC, 200);

    return () => clearTimeout(timer);
  }, [
    localStream,
    isSignalingConnected,
    isObsConnected,
    targetCity,
    addLog,
    nodeId,
    selectedCameraId,
    getStreamingState,
    streamState,
  ]);

  // Update video element when stream changes
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Store refs for stable callbacks
  const signalingRef = useRef(signaling);
  useEffect(() => {
    signalingRef.current = signaling;
  }, [signaling]);

  // Start streaming
  const handleStartStream = useCallback(async () => {
    try {
      // Transition to starting state
      streamState.startStreaming();

      // Notify immediately that we're starting (for operator button sync)
      signalingRef.current?.notifyStreamStarting();

      // Get user media
      const stream = await startMedia();
      if (!stream) {
        throw new Error("Impossible d'accéder à la caméra/microphone");
      }

      setStreamingState(nodeId, true); // Persist streaming state

      // Update ref immediately for request_offer handling
      localStreamRef.current = stream;

      // Set video element source
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Wait for next tick to ensure stream is set
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create WebRTC offer if signaling is connected
      const sig = signalingRef.current;
      const rtc = webrtc;
      if (sig?.isConnected && rtc) {
        await rtc.createOffer();
        // Note: stream_started is sent when WebRTC connects (in the effect below)
        addLog("Diffusion démarrée", "success");
      } else {
        addLog("En attente du serveur...", "warning");
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      handleError(error, "Démarrage du flux", addLog, { category: "webrtc" });

      // Transition to error state
      streamState.setError(errorMessage);

      // Determine error type for categorization
      let errorType: import("@/types").StreamErrorType = "webrtc_offer_failed";
      if (
        errorMessage.includes("Permission") ||
        errorMessage.includes("refusée") ||
        errorMessage.includes("caméra") ||
        errorMessage.includes("microphone")
      ) {
        errorType = "media_permission_denied";
      }

      // Broadcast error to operator (before stream_stopped)
      signalingRef.current?.notifyStreamError(errorType, errorMessage);

      // Notify that start failed
      signalingRef.current?.notifyStreamStopped("manual");
    }
  }, [addLog, startMedia, nodeId, setStreamingState, streamState]);

  // Stop streaming (keeps local preview running)
  const handleStopStream = useCallback(async () => {
    // Transition to stopping state
    streamState.stopStreaming();

    // Notify immediately that we're stopping (for operator button sync)
    signalingRef.current?.notifyStreamStopping();

    setStreamingState(nodeId, false); // Persist streaming state

    // Close OBS WebRTC connection (but keep local media for preview)
    obsWebRTC?.close();

    // Close all operator connections
    for (const [id, service] of operatorConnectionsRef.current) {
      console.log(`🧹 Closing operator connection on stop: ${id}`);
      service.close();
    }
    operatorConnectionsRef.current.clear();

    // Notify signaling server that stop is complete
    signalingRef.current?.notifyStreamStopped("manual");

    // Reset auto-start flag so manual restart works
    hasAutoStarted.current = true; // Keep true to prevent auto-restart

    addLog("Diffusion arrêtée", "info");

    // Show loading for a minimum duration so user sees feedback
    // WebRTC close is synchronous, so we add a small delay for UX
    await new Promise((resolve) => setTimeout(resolve, 500));
    // Transition to idle state
    streamState.streamingStopped();
  }, [addLog, nodeId, setStreamingState, streamState]);

  // Keep remote control refs in sync with handlers
  useEffect(() => {
    startStreamRef.current = handleStartStream;
    stopStreamRef.current = handleStopStream;
  }, [handleStartStream, handleStopStream]);

  // Send heartbeat while streaming (every 5 seconds)
  // Allows operator to detect sender crash faster than WebRTC timeout
  useEffect(() => {
    if (!isStreaming) return;

    const heartbeatInterval = setInterval(() => {
      signalingRef.current?.sendStreamHeartbeat();
    }, 5000); // Every 5 seconds

    // Send initial heartbeat immediately
    signalingRef.current?.sendStreamHeartbeat();

    return () => clearInterval(heartbeatInterval);
  }, [isStreaming]);

  // Notify server when page is closed or refreshed
  // This prevents stale connections and allows immediate reconnection
  useEffect(() => {
    const handlePageClose = () => {
      if (isStreaming) {
        signalingRef.current?.notifyStreamStopped("page_closed");
      }
    };

    window.addEventListener("beforeunload", handlePageClose);
    window.addEventListener("pagehide", handlePageClose);

    return () => {
      window.removeEventListener("beforeunload", handlePageClose);
      window.removeEventListener("pagehide", handlePageClose);
    };
  }, [isStreaming]);

  // Fullscreen
  const handleFullscreen = useCallback(() => {
    if (videoContainerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoContainerRef.current.requestFullscreen();
      }
    }
  }, []);

  // Track fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Reset sources (camera + microphone) - stops stream and clears selections
  const handleResetSources = useCallback(() => {
    // Stop media if running
    if (localStream) {
      stopMedia();
    }
    // Stop streaming if active
    if (isStreaming) {
      streamState.reset();
      setStreamingState(nodeId, false); // Persist streaming state
      signaling.notifyStreamStopped("manual");
    }
    // Clear video preview
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    // Clear device selections (both in hook state and persisted)
    setSelectedCamera(null);
    setSelectedMicrophone(null);
  }, [
    localStream,
    isStreaming,
    stopMedia,
    signaling,
    setSelectedCamera,
    setSelectedMicrophone,
    nodeId,
    setStreamingState,
    streamState,
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
    const newEnabled = !audioEnabled;
    setSelectedDevices(nodeId, { audioEnabled: newEnabled });

    // Enable/disable audio tracks in local stream
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      for (const track of audioTracks) {
        track.enabled = newEnabled;
      }
    }
  }, [audioEnabled, nodeId, setSelectedDevices, localStream]);

  // Apply audio enabled state when stream starts or audioEnabled changes
  useEffect(() => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      for (const track of audioTracks) {
        track.enabled = audioEnabled;
      }
    }
  }, [localStream, audioEnabled]);

  // Show blocking overlay if duplicate sender detected
  if (blockedMessage) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
              <VideoOff className="h-10 w-10 text-destructive" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-destructive">
              Émetteur déjà actif
            </h1>
            <p className="text-muted-foreground">{blockedMessage}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Fermez cet onglet et utilisez l'onglet existant, ou fermez l'autre
            onglet puis rafraîchissez cette page.
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Rafraîchir la page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
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
                <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
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
                        defaultValue={["sources", "video"]}
                        className="w-full"
                      >
                        {/* Sources Section */}
                        <AccordionItem
                          value="sources"
                          className="border-0 px-4"
                        >
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
                                  onSelect={setSelectedCamera}
                                  disabled={false}
                                  placeholder="Sélectionner une caméra"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label
                                  className={cn(
                                    "flex items-center gap-2 text-xs",
                                    !audioEnabled
                                      ? "text-muted-foreground"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {audioEnabled ? (
                                    <Mic className="h-3.5 w-3.5" />
                                  ) : (
                                    <MicOff className="h-3.5 w-3.5 text-destructive" />
                                  )}
                                  Microphone {!audioEnabled && "(muet)"}
                                </Label>
                                <DeviceSelector
                                  devices={microphones}
                                  selectedDeviceId={selectedMicrophoneId}
                                  onSelect={setSelectedMicrophone}
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
                            <VideoSettings
                              settings={videoSettings}
                              onSettingsChange={setVideoSettings}
                              cameraCapabilities={cameraCapabilities}
                              disabled={!selectedCameraId}
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
                          onClick={() => {
                            handleResetSources();
                            handleResetVideoSettings();
                          }}
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
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto space-y-4 p-4">
          {/* Video + Settings stacked vertically */}
          <div className="mx-auto max-w-2xl space-y-4">
            {/* Left: Video Preview with Controls */}
            <div className="space-y-2">
              {/* Connection Status Badges - Centered above video */}
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <SignalingBadge connected={isSignalingConnected} />
                <ReceiverStatusBadge
                  senderNodeId={nodeId}
                  connectedPeers={connectedPeers}
                />
                <WebRTCBadge
                  state={webrtc.connectionState}
                  targetName={targetCity}
                />
              </div>

              {/* Video + Controls Container (merged) */}
              <div className="overflow-hidden rounded-lg border bg-card">
                {/* Video Container */}
                <div
                  ref={videoContainerRef}
                  className="relative aspect-video w-full bg-muted"
                >
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full scale-x-[-1] object-contain"
                    style={{ backgroundColor: "transparent" }}
                    onCanPlay={() => setIsVideoReady(true)}
                    onPlaying={() => setIsVideoReady(true)}
                  />

                  {/* Streaming Status Badge */}
                  {localStream &&
                    (() => {
                      const isLive =
                        webrtc.connectionState === ConnectionState.CONNECTED;
                      const isConnecting =
                        webrtc.connectionState === ConnectionState.CONNECTING ||
                        webrtc.connectionState === ConnectionState.RECONNECTING;

                      return (
                        <Badge
                          variant="outline"
                          className={cn(
                            "absolute left-3 top-3 gap-1.5",
                            isLive
                              ? "border-red-500/30 bg-red-500/10 text-red-500"
                              : isConnecting
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                                : "border-muted-foreground/30 bg-muted text-muted-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              isLive
                                ? "bg-red-500 animate-pulse"
                                : isConnecting
                                  ? "bg-amber-500 animate-pulse"
                                  : "bg-muted-foreground",
                            )}
                          />
                          {isLive
                            ? "En direct"
                            : isConnecting
                              ? "Connexion..."
                              : "Hors ligne"}
                        </Badge>
                      );
                    })()}

                  {/* Exit Fullscreen Button - Only visible in fullscreen (for mobile) */}
                  {isFullscreen && (
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-3 top-3 h-10 w-10 rounded-full bg-black/50 text-white hover:bg-black/70"
                      onClick={handleFullscreen}
                      aria-label="Quitter le plein écran"
                    >
                      <Minimize2 className="h-5 w-5" />
                    </Button>
                  )}

                  {/* No Video Overlay - show until video is actually playing */}
                  {/* Loading state - non-interactive */}
                  {(!localStream || !isVideoReady) &&
                    (isInitializing ||
                      isLoadingCamera ||
                      (selectedCameraId && !isVideoReady)) && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted">
                        <div className="rounded-full bg-muted-foreground/10 p-4">
                          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Chargement...
                        </p>
                      </div>
                    )}
                  {/* No camera selected - interactive prompt */}
                  {(!localStream || !isVideoReady) &&
                    !selectedCameraId &&
                    !isInitializing &&
                    !isLoadingCamera && (
                      // biome-ignore lint/a11y/useSemanticElements: div needed for absolute positioning overlay
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label="Ouvrir les paramètres"
                        className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted cursor-pointer hover:bg-muted/80 transition-colors"
                        onClick={() => setIsSettingsOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setIsSettingsOpen(true);
                          }
                        }}
                      >
                        <div className="rounded-full bg-muted-foreground/10 p-4">
                          <Settings2 className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground text-center px-4">
                          Cliquez ici pour sélectionner
                          <br />
                          un périphérique vidéo et/ou audio
                        </p>
                      </div>
                    )}
                </div>

                {/* Control Bar - Merged with video */}
                <div className="flex items-center justify-center gap-2 border-t p-2">
                  {/* Play/Stop Button - based on actual WebRTC connection state */}
                  {(() => {
                    const isWebRTCConnected =
                      webrtc.connectionState === ConnectionState.CONNECTED;
                    const isWebRTCConnecting =
                      webrtc.connectionState === ConnectionState.CONNECTING ||
                      webrtc.connectionState === ConnectionState.RECONNECTING;

                    // Show loading button during explicit transitions OR when streaming but WebRTC reconnecting
                    // The second case handles page refresh: state is "streaming" but WebRTC is still connecting
                    if (streamLoading || (isStreaming && isWebRTCConnecting)) {
                      return (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-block">
                              <Button
                                size="icon"
                                className="h-10 w-10 rounded-full"
                                disabled
                                aria-label={
                                  streamLoadingType === "stopping"
                                    ? "Arrêt en cours"
                                    : "Connexion en cours"
                                }
                              >
                                <Loader2 className="h-5 w-5 animate-spin" />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {streamLoadingType === "stopping"
                              ? "Arrêt en cours..."
                              : "Connexion en cours..."}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-block">
                            {!isWebRTCConnected && !isStreaming ? (
                              <Button
                                size="icon"
                                className={cn(
                                  "h-10 w-10 rounded-full",
                                  styles.button,
                                )}
                                onClick={handleStartStream}
                                disabled={
                                  !isSignalingConnected ||
                                  !selectedCameraId ||
                                  !isObsConnected
                                }
                                aria-label={`Diffuser vers ${targetCity}`}
                              >
                                <Play className="h-5 w-5" />
                              </Button>
                            ) : (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-10 w-10 rounded-full border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
                                    aria-label="Arrêter la diffusion"
                                  >
                                    <Square className="h-5 w-5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Arrêter le flux ?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Voulez-vous vraiment arrêter la diffusion
                                      ? Cette action interrompra le flux en
                                      direct.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Annuler
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={handleStopStream}
                                    >
                                      Confirmer
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {!isWebRTCConnected
                            ? !selectedCameraId
                              ? "Sélectionnez une caméra"
                              : !isObsConnected
                                ? `${targetCity} OBS non disponible`
                                : `Diffuser vers ${targetCity}`
                            : "Arrêter la diffusion"}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })()}

                  {/* Mic Toggle */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-10 w-10 rounded-full",
                          audioEnabled
                            ? "hover:bg-muted"
                            : "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive",
                        )}
                        onClick={handleToggleAudio}
                        aria-label={
                          audioEnabled
                            ? "Désactiver le micro"
                            : "Activer le micro"
                        }
                      >
                        {audioEnabled ? (
                          <Mic className="h-5 w-5" />
                        ) : (
                          <MicOff className="h-5 w-5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {audioEnabled
                        ? "Désactiver le micro"
                        : "Activer le micro"}
                    </TooltipContent>
                  </Tooltip>

                  {/* Audio Level Meter - Inline with controls */}
                  {localStream && (
                    <div
                      className={cn(
                        "flex-1 max-w-48",
                        !audioEnabled && "opacity-50",
                      )}
                    >
                      <AudioLevelMeter
                        stream={localStream}
                        size="sm"
                        accentColor={accentColor}
                      />
                    </div>
                  )}

                  {/* Fullscreen Toggle */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full hover:bg-muted"
                        onClick={handleFullscreen}
                        aria-label={
                          isFullscreen
                            ? "Quitter le plein écran"
                            : "Plein écran"
                        }
                      >
                        {isFullscreen ? (
                          <Minimize2 className="h-5 w-5" />
                        ) : (
                          <Maximize2 className="h-5 w-5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isFullscreen ? "Quitter le plein écran" : "Plein écran"}
                    </TooltipContent>
                  </Tooltip>

                  {/* Stream Uptime */}
                  <StreamUptime
                    isStreaming={isStreaming}
                    startTime={streamStartTime ?? undefined}
                    size="sm"
                  />
                </div>
              </div>
            </div>
          </div>

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
