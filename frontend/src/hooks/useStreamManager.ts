// useStreamManager - React hook that bridges StreamManager to React components
// Pattern: Service-to-React bridge hook

import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionState, type NodeId, SignalingState } from "@/constants";
import type { SenderNodeId } from "@/constants/node-ids";
import { StreamManager } from "@/services";
import { useStore } from "@/stores";
import type { VideoSettings } from "@/types";

export interface UseStreamManagerOptions {
  nodeId: SenderNodeId;
  obsTarget: NodeId;
  targetCity: string;
  onStreamControl?: (action: "start" | "stop") => void;
  /** Called when receiving audio ducking command from remote sender */
  onAudioDucking?: (ducking: boolean, gain: number) => void;
  addLog?: (
    message: string,
    level?: "info" | "warning" | "error" | "success",
  ) => void;
}

export interface UseStreamManagerReturn {
  // Manager instance (for advanced use)
  manager: StreamManager | null;

  // Signaling state
  isSignalingConnected: boolean;
  isSignalingBlocked: boolean;
  connectedPeers: NodeId[];

  // WebRTC state
  obsConnectionState: ConnectionState;

  // Actions
  connect: () => void;
  disconnect: () => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setVideoSettings: (settings: VideoSettings) => void;
  replaceVideoTrack: (track: MediaStreamTrack) => Promise<void>;
  replaceAudioTrack: (track: MediaStreamTrack) => Promise<void>;
  startStreaming: () => Promise<void>;
  stopStreaming: (reason?: "manual" | "page_closed" | "network_lost") => void;
  notifyPageOpened: () => void;

  // Additional signaling notifications
  notifyStreamStarting: () => void;
  notifyStreamStopping: () => void;
  notifyStreamStarted: () => void;
  notifyStreamError: (
    error:
      | "media_permission_denied"
      | "webrtc_offer_failed"
      | "webrtc_connection_failed"
      | "timeout",
    message: string,
  ) => void;

  // Manual WebRTC control
  createObsOffer: () => Promise<void>;
  closeObsConnection: () => void;
  closeOperatorConnections: () => void;
  applySettingsToObs: (settings: VideoSettings) => void;
  applyBitrateToAll: (bitrate: number | "auto") => void;
  applyCodecToAll: (codec: string | "auto") => void;
  setStreamingState: (streaming: boolean) => void;

  // VOX Ducking support
  /** Send audio ducking command to target node */
  sendAudioDucking: (target: NodeId, ducking: boolean, gain?: number) => void;
}

/**
 * Hook that manages stream connections for a sender dashboard.
 *
 * Usage:
 * ```tsx
 * const stream = useStreamManager({
 *   nodeId: NodeId.NANTES,
 *   obsTarget: NodeId.OBS_PARIS,
 *   targetCity: "Paris",
 *   onStreamControl: (action) => { ... },
 *   addLog: (msg, level) => { ... },
 * });
 *
 * // Connect on mount
 * useEffect(() => { stream.connect(); }, []);
 *
 * // Set stream when available
 * stream.setLocalStream(mediaStream);
 *
 * // Start/stop streaming
 * await stream.startStreaming();
 * stream.stopStreaming();
 * ```
 */
export function useStreamManager(
  options: UseStreamManagerOptions,
): UseStreamManagerReturn {
  const {
    nodeId,
    obsTarget,
    targetCity,
    onStreamControl,
    onAudioDucking,
    addLog,
  } = options;

  // Store integration - use individual selectors for stable references
  const setSignalingState = useStore((s) => s.setSignalingState);
  const setConnectedPeers = useStore((s) => s.setConnectedPeers);

  // State
  const [isSignalingConnected, setIsSignalingConnected] = useState(false);
  const [isSignalingBlocked, setIsSignalingBlocked] = useState(false);
  const [connectedPeers, setLocalConnectedPeers] = useState<NodeId[]>([]);
  const [obsConnectionState, setObsConnectionState] = useState<ConnectionState>(
    ConnectionState.DISCONNECTED,
  );

  // Refs
  const managerRef = useRef<StreamManager | null>(null);
  const onStreamControlRef = useRef(onStreamControl);
  const onAudioDuckingRef = useRef(onAudioDucking);
  const addLogRef = useRef(addLog);

  // Keep refs updated
  useEffect(() => {
    onStreamControlRef.current = onStreamControl;
  }, [onStreamControl]);

  useEffect(() => {
    onAudioDuckingRef.current = onAudioDucking;
  }, [onAudioDucking]);

  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  // Initialize manager
  useEffect(() => {
    const manager = new StreamManager({
      nodeId,
      obsTarget,
      targetCity,
      onStreamControl: (action) => {
        onStreamControlRef.current?.(action);
      },
      onLog: (message, level) => {
        addLogRef.current?.(message, level);
      },
      onSignalingStateChange: (state) => {
        setSignalingState(state);
        setIsSignalingConnected(state === SignalingState.CONNECTED);
      },
      onObsConnectionStateChange: (state) => {
        setObsConnectionState(state);
      },
      onSignalingConnectedPeersChange: (peers) => {
        setLocalConnectedPeers(peers);
        setConnectedPeers(peers);
      },
      onAudioDucking: (ducking, gain) => {
        onAudioDuckingRef.current?.(ducking, gain);
      },
    });

    managerRef.current = manager;

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [nodeId, obsTarget, targetCity, setSignalingState, setConnectedPeers]);

  // Update blocked state
  useEffect(() => {
    const checkBlocked = () => {
      setIsSignalingBlocked(managerRef.current?.isSignalingBlocked ?? false);
    };
    // Check periodically (signaling service updates this asynchronously)
    const interval = setInterval(checkBlocked, 500);
    checkBlocked();
    return () => clearInterval(interval);
  }, []);

  // Actions
  const connect = useCallback(() => {
    managerRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    managerRef.current?.disconnect();
  }, []);

  const setLocalStream = useCallback((stream: MediaStream | null) => {
    managerRef.current?.setLocalStream(stream);
  }, []);

  const setVideoSettings = useCallback((settings: VideoSettings) => {
    managerRef.current?.setVideoSettings(settings);
  }, []);

  const replaceVideoTrack = useCallback(async (track: MediaStreamTrack) => {
    await managerRef.current?.replaceVideoTrack(track);
  }, []);

  const replaceAudioTrack = useCallback(async (track: MediaStreamTrack) => {
    await managerRef.current?.replaceAudioTrack(track);
  }, []);

  const startStreaming = useCallback(async () => {
    await managerRef.current?.startStreaming();
  }, []);

  const stopStreaming = useCallback(
    (reason?: "manual" | "page_closed" | "network_lost") => {
      managerRef.current?.stopStreaming(reason);
    },
    [],
  );

  const notifyPageOpened = useCallback(() => {
    managerRef.current?.notifyPageOpened();
  }, []);

  const notifyStreamStarting = useCallback(() => {
    managerRef.current?.notifyStreamStarting();
  }, []);

  const notifyStreamStopping = useCallback(() => {
    managerRef.current?.notifyStreamStopping();
  }, []);

  const notifyStreamStarted = useCallback(() => {
    managerRef.current?.notifyStreamStarted();
  }, []);

  const notifyStreamError = useCallback(
    (
      error:
        | "media_permission_denied"
        | "webrtc_offer_failed"
        | "webrtc_connection_failed"
        | "timeout",
      message: string,
    ) => {
      managerRef.current?.notifyStreamError(error, message);
    },
    [],
  );

  const createObsOffer = useCallback(async () => {
    if (!managerRef.current) {
      console.error("🎬 createObsOffer: managerRef.current is null!");
      return;
    }
    console.log("🎬 createObsOffer: calling manager.createObsOffer()");
    await managerRef.current.createObsOffer();
    console.log("🎬 createObsOffer: completed");
  }, []);

  const closeObsConnection = useCallback(() => {
    managerRef.current?.closeObsConnection();
  }, []);

  const closeOperatorConnections = useCallback(() => {
    managerRef.current?.closeOperatorConnections();
  }, []);

  const applySettingsToObs = useCallback((settings: VideoSettings) => {
    managerRef.current?.applySettingsToObs(settings);
  }, []);

  const applyBitrateToAll = useCallback((bitrate: number | "auto") => {
    managerRef.current?.applyBitrateToAll(bitrate);
  }, []);

  const applyCodecToAll = useCallback((codec: string | "auto") => {
    managerRef.current?.applyCodecToAll(codec);
  }, []);

  const setStreamingState = useCallback((streaming: boolean) => {
    managerRef.current?.setStreamingState(streaming);
  }, []);

  const sendAudioDucking = useCallback(
    (target: NodeId, ducking: boolean, gain: number = 0.15) => {
      managerRef.current
        ?.getSignalingService()
        .sendAudioDucking(target, ducking, gain);
    },
    [],
  );

  return {
    manager: managerRef.current,
    isSignalingConnected,
    isSignalingBlocked,
    connectedPeers,
    obsConnectionState,
    connect,
    disconnect,
    setLocalStream,
    setVideoSettings,
    replaceVideoTrack,
    replaceAudioTrack,
    startStreaming,
    stopStreaming,
    notifyPageOpened,
    notifyStreamStarting,
    notifyStreamStopping,
    notifyStreamStarted,
    notifyStreamError,
    createObsOffer,
    closeObsConnection,
    closeOperatorConnections,
    applySettingsToObs,
    applyBitrateToAll,
    applyCodecToAll,
    setStreamingState,
    sendAudioDucking,
  };
}
