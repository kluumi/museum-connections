import { createFileRoute } from "@tanstack/react-router";
import { Activity, Eye, LayoutGrid, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatsPanel } from "@/components/dashboard/StatsPanel";
import { VideoPanel } from "@/components/operator/VideoPanel";
import {
  ConsoleLog,
  createLogEntry,
  type LogEntry,
} from "@/components/shared/ConsoleLog";
import { SignalingBadge } from "@/components/shared/StatusBadge";
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
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConnectionState } from "@/constants/connection-states";
import { generateOperatorNodeId, NodeId } from "@/constants/node-ids";
import { useSignaling } from "@/hooks/useSignaling";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useStore } from "@/stores";

export const Route = createFileRoute("/receivers/operator")({
  component: OperatorDashboard,
});

// LocalStorage key for operator settings
const OPERATOR_SETTINGS_KEY = "operator-dashboard-settings";

interface OperatorSettings {
  showDetailedStats: boolean;
  stackedLayout: boolean;
}

function loadOperatorSettings(): OperatorSettings {
  try {
    const stored = localStorage.getItem(OPERATOR_SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored) as OperatorSettings;
    }
  } catch {
    // Ignore parse errors
  }
  return { showDetailedStats: true, stackedLayout: false };
}

function saveOperatorSettings(settings: OperatorSettings): void {
  localStorage.setItem(OPERATOR_SETTINGS_KEY, JSON.stringify(settings));
}

function OperatorDashboard() {
  // Generate a unique ID for this operator instance (allows multiple tabs)
  const [nodeId] = useState(() => generateOperatorNodeId());

  // Logs per city
  const [nantesLogs, setNantesLogs] = useState<LogEntry[]>([]);
  const [parisLogs, setParisLogs] = useState<LogEntry[]>([]);

  // Settings state - persisted to localStorage
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showDetailedStats, setShowDetailedStats] = useState(
    () => loadOperatorSettings().showDetailedStats,
  );
  const [stackedLayout, setStackedLayout] = useState(
    () => loadOperatorSettings().stackedLayout,
  );

  // Persist settings when they change
  useEffect(() => {
    saveOperatorSettings({ showDetailedStats, stackedLayout });
  }, [showDetailedStats, stackedLayout]);

  // Loading state for streams (stopping or starting)
  const [nantesLoading, setNantesLoading] = useState<
    "starting" | "stopping" | false
  >(false);
  const [parisLoading, setParisLoading] = useState<
    "starting" | "stopping" | false
  >(false);

  // Track who initiated the stop (operator vs sender)
  const nantesStopByOperator = useRef(false);
  const parisStopByOperator = useRef(false);

  // Track whether stream was manually stopped (to show "Arrêté" instead of "Reconnexion...")
  const [nantesManuallyStopped, setNantesManuallyStopped] = useState(false);
  const [parisManuallyStopped, setParisManuallyStopped] = useState(false);

  // Heartbeat tracking - detect sender crash faster than WebRTC timeout
  const [nantesHeartbeatStatus, setNantesHeartbeatStatus] = useState<
    "ok" | "warning" | "dead" | null
  >(null);
  const [parisHeartbeatStatus, setParisHeartbeatStatus] = useState<
    "ok" | "warning" | "dead" | null
  >(null);
  const nantesLastHeartbeat = useRef<number | null>(null);
  const parisLastHeartbeat = useRef<number | null>(null);

  const addNantesLog = useCallback(
    (message: string, level: LogEntry["level"] = "info") => {
      setNantesLogs((prev) => [
        ...prev.slice(-50),
        createLogEntry(message, level),
      ]);
    },
    [],
  );

  const addParisLog = useCallback(
    (message: string, level: LogEntry["level"] = "info") => {
      setParisLogs((prev) => [
        ...prev.slice(-50),
        createLogEntry(message, level),
      ]);
    },
    [],
  );

  // Refs for WebRTC instances
  const nantesWebRTCRef = useRef<ReturnType<typeof useWebRTC> | null>(null);
  const parisWebRTCRef = useRef<ReturnType<typeof useWebRTC> | null>(null);
  const hasRequestedNantes = useRef(false);
  const hasRequestedParis = useRef(false);

  // Track pending offers that arrived before WebRTC was ready
  const pendingOffersRef = useRef<Map<NodeId, RTCSessionDescriptionInit>>(
    new Map(),
  );
  const pendingCandidatesRef = useRef<Map<NodeId, RTCIceCandidateInit[]>>(
    new Map(),
  );

  // Connect to signaling server
  const signaling = useSignaling(nodeId, {
    autoConnect: true,
    onMessage: (message) => {
      // Handle offers from senders
      if (message.type === "offer") {
        const fromNantes = message.from === NodeId.NANTES;
        const fromParis = message.from === NodeId.PARIS;

        if (fromNantes) {
          if (nantesWebRTCRef.current) {
            nantesWebRTCRef.current.handleOffer(message.offer).catch(() => {
              pendingOffersRef.current.set(NodeId.NANTES, message.offer);
            });
          } else {
            pendingOffersRef.current.set(NodeId.NANTES, message.offer);
          }
        } else if (fromParis) {
          if (parisWebRTCRef.current) {
            parisWebRTCRef.current.handleOffer(message.offer).catch(() => {
              pendingOffersRef.current.set(NodeId.PARIS, message.offer);
            });
          } else {
            pendingOffersRef.current.set(NodeId.PARIS, message.offer);
          }
        }
      }

      // Handle ICE candidates
      if (message.type === "candidate") {
        const fromNantes = message.from === NodeId.NANTES;
        const fromParis = message.from === NodeId.PARIS;

        if (fromNantes) {
          if (nantesWebRTCRef.current) {
            nantesWebRTCRef.current.addIceCandidate(message.candidate);
          } else {
            // Queue candidate if ref not ready
            const existing =
              pendingCandidatesRef.current.get(NodeId.NANTES) ?? [];
            existing.push(message.candidate);
            pendingCandidatesRef.current.set(NodeId.NANTES, existing);
          }
        } else if (fromParis) {
          if (parisWebRTCRef.current) {
            parisWebRTCRef.current.addIceCandidate(message.candidate);
          } else {
            // Queue candidate if ref not ready
            const existing =
              pendingCandidatesRef.current.get(NodeId.PARIS) ?? [];
            existing.push(message.candidate);
            pendingCandidatesRef.current.set(NodeId.PARIS, existing);
          }
        }
      }

      // Handle stream_starting - sender just clicked start, show loading immediately
      if (message.type === "stream_starting") {
        if (message.from === NodeId.NANTES) {
          setNantesLoading("starting");
          addNantesLog("Démarrage en cours...", "info");
        } else if (message.from === NodeId.PARIS) {
          setParisLoading("starting");
          addParisLog("Démarrage en cours...", "info");
        }
      }

      // Handle stream_stopping - sender just clicked stop, show loading immediately
      if (message.type === "stream_stopping") {
        if (message.from === NodeId.NANTES) {
          setNantesLoading("stopping");
          addNantesLog("Arrêt en cours...", "info");
        } else if (message.from === NodeId.PARIS) {
          setParisLoading("stopping");
          addParisLog("Arrêt en cours...", "info");
        }
      }

      // Handle stream_started - sender's WebRTC is ready, request offer
      // Don't clear loading here - wait for OUR WebRTC to connect (handled by fallback useEffect)
      if (message.type === "stream_started" || message.type === "page_opened") {
        if (message.from === NodeId.NANTES) {
          hasRequestedNantes.current = false;
          setNantesManuallyStopped(false); // Reset manual stop state when stream starts
          signaling.requestOffer(NodeId.NANTES);
          if (message.type === "stream_started") {
            // Don't clear loading - wait for WebRTC connection (useEffect below)
            addNantesLog("Flux émetteur prêt, connexion...", "info");
          }
        } else if (message.from === NodeId.PARIS) {
          hasRequestedParis.current = false;
          setParisManuallyStopped(false); // Reset manual stop state when stream starts
          signaling.requestOffer(NodeId.PARIS);
          if (message.type === "stream_started") {
            // Don't clear loading - wait for WebRTC connection (useEffect below)
            addParisLog("Flux émetteur prêt, connexion...", "info");
          }
        }
      }

      // Handle stream_stopped - sender confirmed stop
      if (message.type === "stream_stopped") {
        // Track if manually stopped (not network_lost) to show "Arrêté" badge instead of "Reconnexion..."
        const wasManualStop = message.reason !== "network_lost";

        if (message.from === NodeId.NANTES) {
          // Reset heartbeat tracking - stream is intentionally stopped
          nantesLastHeartbeat.current = null;
          setNantesHeartbeatStatus(null);
          setNantesManuallyStopped(wasManualStop);
          // Close WebRTC to stop reconnection attempts when manually stopped
          if (wasManualStop) {
            nantesWebRTCRef.current?.close();
          }
          if (nantesStopByOperator.current) {
            addNantesLog("Flux arrêté par l'opérateur", "warning");
            nantesStopByOperator.current = false;
          } else {
            addNantesLog("Flux arrêté par l'émetteur", "warning");
          }
        } else if (message.from === NodeId.PARIS) {
          // Reset heartbeat tracking - stream is intentionally stopped
          parisLastHeartbeat.current = null;
          setParisHeartbeatStatus(null);
          setParisManuallyStopped(wasManualStop);
          // Close WebRTC to stop reconnection attempts when manually stopped
          if (wasManualStop) {
            parisWebRTCRef.current?.close();
          }
          if (parisStopByOperator.current) {
            addParisLog("Flux arrêté par l'opérateur", "warning");
            parisStopByOperator.current = false;
          } else {
            addParisLog("Flux arrêté par l'émetteur", "warning");
          }
        }
      }

      // Handle peer_disconnected - sender refreshed or disconnected
      // Close the stale WebRTC connection so we can establish a fresh one when they reconnect
      if (message.type === "peer_disconnected") {
        if (message.peer === NodeId.NANTES) {
          nantesWebRTCRef.current?.close();
          nantesLastHeartbeat.current = null;
          setNantesHeartbeatStatus(null);
          addNantesLog("Émetteur déconnecté", "warning");
        } else if (message.peer === NodeId.PARIS) {
          parisWebRTCRef.current?.close();
          parisLastHeartbeat.current = null;
          setParisHeartbeatStatus(null);
          addParisLog("Émetteur déconnecté", "warning");
        }
      }

      // Handle stream_heartbeat - sender is alive and streaming
      if (message.type === "stream_heartbeat") {
        if (message.from === NodeId.NANTES) {
          nantesLastHeartbeat.current = Date.now();
          if (nantesHeartbeatStatus !== "ok") {
            setNantesHeartbeatStatus("ok");
          }
        } else if (message.from === NodeId.PARIS) {
          parisLastHeartbeat.current = Date.now();
          if (parisHeartbeatStatus !== "ok") {
            setParisHeartbeatStatus("ok");
          }
        }
      }

      // Handle stream_error - sender encountered an error during start
      // Clear loading state immediately and show error message
      if (message.type === "stream_error") {
        if (message.from === NodeId.NANTES) {
          setNantesLoading(false);
          addNantesLog(`Erreur émetteur: ${message.message}`, "error");
        } else if (message.from === NodeId.PARIS) {
          setParisLoading(false);
          addParisLog(`Erreur émetteur: ${message.message}`, "error");
        }
      }
    },
  });

  // WebRTC connections to both senders
  const nantesWebRTC = useWebRTC(nodeId, NodeId.NANTES, signaling.service, {});
  const parisWebRTC = useWebRTC(nodeId, NodeId.PARIS, signaling.service, {});

  // Keep refs updated
  nantesWebRTCRef.current = nantesWebRTC;
  parisWebRTCRef.current = parisWebRTC;

  // Heartbeat monitoring - check for stale heartbeats every 5 seconds
  // Warning after 15s, dead after 30s
  const HEARTBEAT_WARNING_MS = 15000;
  const HEARTBEAT_DEAD_MS = 30000;

  useEffect(() => {
    const checkHeartbeats = () => {
      const now = Date.now();

      // Check Nantes heartbeat
      if (nantesLastHeartbeat.current !== null) {
        const elapsed = now - nantesLastHeartbeat.current;
        if (elapsed > HEARTBEAT_DEAD_MS) {
          if (nantesHeartbeatStatus !== "dead") {
            setNantesHeartbeatStatus("dead");
            addNantesLog("⚠️ Connexion perdue (pas de heartbeat)", "error");
          }
        } else if (elapsed > HEARTBEAT_WARNING_MS) {
          if (nantesHeartbeatStatus !== "warning") {
            setNantesHeartbeatStatus("warning");
            addNantesLog("⚠️ Heartbeat lent, connexion instable", "warning");
          }
        } else {
          if (nantesHeartbeatStatus !== "ok") {
            setNantesHeartbeatStatus("ok");
          }
        }
      }

      // Check Paris heartbeat
      if (parisLastHeartbeat.current !== null) {
        const elapsed = now - parisLastHeartbeat.current;
        if (elapsed > HEARTBEAT_DEAD_MS) {
          if (parisHeartbeatStatus !== "dead") {
            setParisHeartbeatStatus("dead");
            addParisLog("⚠️ Connexion perdue (pas de heartbeat)", "error");
          }
        } else if (elapsed > HEARTBEAT_WARNING_MS) {
          if (parisHeartbeatStatus !== "warning") {
            setParisHeartbeatStatus("warning");
            addParisLog("⚠️ Heartbeat lent, connexion instable", "warning");
          }
        } else {
          if (parisHeartbeatStatus !== "ok") {
            setParisHeartbeatStatus("ok");
          }
        }
      }
    };

    const interval = setInterval(checkHeartbeats, 5000);
    return () => clearInterval(interval);
  }, [nantesHeartbeatStatus, parisHeartbeatStatus, addNantesLog, addParisLog]);

  // Process pending offers when WebRTC services become ready
  useEffect(() => {
    if (!signaling.service) return;

    const timer = setTimeout(() => {
      // Process pending Nantes offer
      const nantesOffer = pendingOffersRef.current.get(NodeId.NANTES);
      if (nantesOffer && nantesWebRTCRef.current) {
        nantesWebRTCRef.current.handleOffer(nantesOffer).catch(() => {
          signaling.requestOffer(NodeId.NANTES);
        });
        pendingOffersRef.current.delete(NodeId.NANTES);

        const nantesCandidates =
          pendingCandidatesRef.current.get(NodeId.NANTES) ?? [];
        for (const candidate of nantesCandidates) {
          nantesWebRTCRef.current.addIceCandidate(candidate);
        }
        pendingCandidatesRef.current.delete(NodeId.NANTES);
      }

      // Process pending Paris offer
      const parisOffer = pendingOffersRef.current.get(NodeId.PARIS);
      if (parisOffer && parisWebRTCRef.current) {
        parisWebRTCRef.current.handleOffer(parisOffer).catch(() => {
          signaling.requestOffer(NodeId.PARIS);
        });
        pendingOffersRef.current.delete(NodeId.PARIS);

        const parisCandidates =
          pendingCandidatesRef.current.get(NodeId.PARIS) ?? [];
        for (const candidate of parisCandidates) {
          parisWebRTCRef.current.addIceCandidate(candidate);
        }
        pendingCandidatesRef.current.delete(NodeId.PARIS);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [signaling.service, signaling.requestOffer]);

  // Request offers when signaling connects and sources are available
  useEffect(() => {
    if (!signaling.isConnected) {
      hasRequestedNantes.current = false;
      hasRequestedParis.current = false;
      return;
    }

    const timer = setTimeout(() => {
      if (
        signaling.connectedPeers.includes(NodeId.NANTES) &&
        !hasRequestedNantes.current
      ) {
        hasRequestedNantes.current = true;
        signaling.requestOffer(NodeId.NANTES);
      }

      if (
        signaling.connectedPeers.includes(NodeId.PARIS) &&
        !hasRequestedParis.current
      ) {
        hasRequestedParis.current = true;
        signaling.requestOffer(NodeId.PARIS);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [signaling.isConnected, signaling.connectedPeers, signaling.requestOffer]);

  // Log WebRTC connection changes
  useEffect(() => {
    if (nantesWebRTC.connectionState === ConnectionState.CONNECTED) {
      addNantesLog("Connecté via WebRTC", "success");
    }
  }, [nantesWebRTC.connectionState, addNantesLog]);

  useEffect(() => {
    if (parisWebRTC.connectionState === ConnectionState.CONNECTED) {
      addParisLog("Connecté via WebRTC", "success");
    }
  }, [parisWebRTC.connectionState, addParisLog]);

  // Periodic offer retry when sources are available but not connected
  useEffect(() => {
    if (!signaling.isConnected) return;

    const nantesAvailable = signaling.connectedPeers.includes(NodeId.NANTES);
    const parisAvailable = signaling.connectedPeers.includes(NodeId.PARIS);
    const nantesNeedsRetry =
      nantesAvailable &&
      nantesWebRTC.connectionState !== ConnectionState.CONNECTED;
    const parisNeedsRetry =
      parisAvailable &&
      parisWebRTC.connectionState !== ConnectionState.CONNECTED;

    if (!nantesNeedsRetry && !parisNeedsRetry) return;

    const interval = setInterval(() => {
      if (
        nantesAvailable &&
        nantesWebRTCRef.current?.connectionState !== ConnectionState.CONNECTED
      ) {
        signaling.requestOffer(NodeId.NANTES);
      }
      if (
        parisAvailable &&
        parisWebRTCRef.current?.connectionState !== ConnectionState.CONNECTED
      ) {
        signaling.requestOffer(NodeId.PARIS);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [
    signaling.isConnected,
    signaling.connectedPeers,
    signaling.requestOffer,
    nantesWebRTC.connectionState,
    parisWebRTC.connectionState,
  ]);

  // Get metrics from store
  const peerMetrics = useStore((s) => s.peerMetrics);
  const nantesMetrics = peerMetrics.get(NodeId.NANTES) ?? null;
  const parisMetrics = peerMetrics.get(NodeId.PARIS) ?? null;

  // Connection states
  const nantesConnected =
    nantesWebRTC.connectionState === ConnectionState.CONNECTED;
  const parisConnected =
    parisWebRTC.connectionState === ConnectionState.CONNECTED;

  // Clear loading based on WebRTC state - this is now the primary mechanism
  // stream_starting triggers loading, WebRTC CONNECTED clears it
  useEffect(() => {
    if (nantesConnected && nantesLoading === "starting") {
      setNantesLoading(false);
      addNantesLog("Flux connecté", "success");
    }
    if (!nantesConnected && nantesLoading === "stopping") {
      setNantesLoading(false);
    }
  }, [nantesConnected, nantesLoading, addNantesLog]);

  useEffect(() => {
    if (parisConnected && parisLoading === "starting") {
      setParisLoading(false);
      addParisLog("Flux connecté", "success");
    }
    if (!parisConnected && parisLoading === "stopping") {
      setParisLoading(false);
    }
  }, [parisConnected, parisLoading, addParisLog]);

  // Timeout fallback: clear loading states if stuck for more than 10 seconds
  // This prevents the UI from getting stuck if signaling or WebRTC messages are lost
  useEffect(() => {
    if (!nantesLoading) return;
    const timer = setTimeout(() => {
      setNantesLoading(false);
      addNantesLog("Délai dépassé", "warning");
    }, 10000);
    return () => clearTimeout(timer);
  }, [nantesLoading, addNantesLog]);

  useEffect(() => {
    if (!parisLoading) return;
    const timer = setTimeout(() => {
      setParisLoading(false);
      addParisLog("Délai dépassé", "warning");
    }, 10000);
    return () => clearTimeout(timer);
  }, [parisLoading, addParisLog]);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              {/* Left: Logo & Title */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
                  <Eye className="h-5 w-5 text-cyan-500" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-cyan-500">
                    Régie Opérateur
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Monitoring multi-sources
                  </p>
                </div>
              </div>

              {/* Center: Connection Status Badge */}
              <div className="hidden md:flex items-center gap-2">
                <SignalingBadge connected={signaling.isConnected} />
              </div>

              {/* Right: Settings Drawer */}
              <div className="flex items-center gap-2">
                <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <SlidersHorizontal className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="p-0 flex flex-col">
                    <SheetHeader className="p-4 shrink-0 border-b">
                      <SheetTitle className="text-lg">Paramètres</SheetTitle>
                      <p className="text-xs text-muted-foreground">
                        Affichage et préférences
                      </p>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto">
                      <Accordion
                        type="multiple"
                        defaultValue={["display"]}
                        className="w-full"
                      >
                        {/* Display Settings */}
                        <AccordionItem
                          value="display"
                          className="border-0 px-4"
                        >
                          <AccordionTrigger className="hover:no-underline py-3">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <LayoutGrid className="h-4 w-4" />
                              Affichage
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-6">
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <Label
                                  htmlFor="detailed-stats"
                                  className="text-sm"
                                >
                                  Stats détaillées
                                </Label>
                                <Switch
                                  id="detailed-stats"
                                  checked={showDetailedStats}
                                  onCheckedChange={setShowDetailedStats}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Affiche le panneau de statistiques complet sous
                                chaque flux vidéo.
                              </p>

                              <div className="flex items-center justify-between">
                                <Label
                                  htmlFor="stacked-layout"
                                  className="text-sm"
                                >
                                  Vue empilée
                                </Label>
                                <Switch
                                  id="stacked-layout"
                                  checked={stackedLayout}
                                  onCheckedChange={setStackedLayout}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Affiche les flux l'un au-dessus de l'autre au
                                lieu de côte à côte.
                              </p>
                            </div>
                          </AccordionContent>
                        </AccordionItem>

                        {/* Connection Info */}
                        <AccordionItem
                          value="connection"
                          className="border-0 px-4"
                        >
                          <AccordionTrigger className="hover:no-underline py-3">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <Activity className="h-4 w-4" />
                              Connexions
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-6">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Signalisation
                                </span>
                                <span
                                  className={
                                    signaling.isConnected
                                      ? "text-emerald-500"
                                      : "text-destructive"
                                  }
                                >
                                  {signaling.isConnected
                                    ? "Connecté"
                                    : "Déconnecté"}
                                </span>
                              </div>

                              {/* Nantes Section */}
                              <div className="space-y-1.5 pt-2 border-t">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    🐘 Nantes
                                  </span>
                                  <span
                                    className={
                                      nantesConnected
                                        ? "text-emerald-500"
                                        : "text-muted-foreground"
                                    }
                                  >
                                    {nantesConnected
                                      ? "En direct"
                                      : "Hors ligne"}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-sm pl-5">
                                  <span className="text-muted-foreground text-xs">
                                    Récepteur
                                  </span>
                                  <span
                                    className={
                                      signaling.connectedPeers.includes(
                                        NodeId.OBS_NANTES,
                                      )
                                        ? "text-emerald-500 text-xs"
                                        : "text-muted-foreground text-xs"
                                    }
                                  >
                                    {signaling.connectedPeers.includes(
                                      NodeId.OBS_NANTES,
                                    )
                                      ? "Connecté"
                                      : "Hors ligne"}
                                  </span>
                                </div>
                              </div>

                              {/* Paris Section */}
                              <div className="space-y-1.5 pt-2 border-t">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    🗼 Paris
                                  </span>
                                  <span
                                    className={
                                      parisConnected
                                        ? "text-emerald-500"
                                        : "text-muted-foreground"
                                    }
                                  >
                                    {parisConnected
                                      ? "En direct"
                                      : "Hors ligne"}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-sm pl-5">
                                  <span className="text-muted-foreground text-xs">
                                    Récepteur
                                  </span>
                                  <span
                                    className={
                                      signaling.connectedPeers.includes(
                                        NodeId.OBS_PARIS,
                                      )
                                        ? "text-emerald-500 text-xs"
                                        : "text-muted-foreground text-xs"
                                    }
                                  >
                                    {signaling.connectedPeers.includes(
                                      NodeId.OBS_PARIS,
                                    )
                                      ? "Connecté"
                                      : "Hors ligne"}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-sm pt-2 border-t">
                                <span className="text-muted-foreground">
                                  Pairs connectés
                                </span>
                                <span className="font-mono">
                                  {signaling.connectedPeers.length}
                                </span>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </div>

                    {/* Footer */}
                    <SheetFooter className="shrink-0 border-t p-4">
                      <div className="flex w-full items-center justify-between">
                        <ThemeToggle />
                        <span className="text-xs text-muted-foreground">
                          Régie v2.0
                        </span>
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
          {/* Video Grid */}
          <div
            className={
              stackedLayout ? "space-y-4" : "grid gap-4 lg:grid-cols-2"
            }
          >
            {/* Nantes */}
            <div className="space-y-4">
              <VideoPanel
                title="Nantes"
                emoji="🐘"
                stream={nantesWebRTC.remoteStream}
                metrics={nantesMetrics}
                isConnected={nantesConnected}
                accentColor="nantes"
                noSignalMessage="En attente du flux Nantes..."
                showInlineStats={!showDetailedStats}
                connectionState={nantesWebRTC.connectionState}
                isSenderAvailable={signaling.connectedPeers.includes(
                  NodeId.NANTES,
                )}
                isLoading={nantesLoading}
                obsReceiverId={NodeId.OBS_PARIS}
                isObsConnected={signaling.connectedPeers.includes(
                  NodeId.OBS_PARIS,
                )}
                manuallyStopped={nantesManuallyStopped}
                onStreamControl={(action) => {
                  signaling.sendStreamControl(NodeId.NANTES, action);
                  if (action === "stop") {
                    nantesStopByOperator.current = true;
                    setNantesLoading("stopping");
                  } else {
                    setNantesLoading("starting");
                    addNantesLog("Démarrage demandé par l'opérateur", "info");
                  }
                }}
              />
              {showDetailedStats && (
                <StatsPanel
                  metrics={nantesMetrics}
                  isStreaming={nantesConnected}
                  hideBandwidth
                />
              )}
            </div>

            {/* Paris */}
            <div className="space-y-4">
              <VideoPanel
                title="Paris"
                emoji="🗼"
                stream={parisWebRTC.remoteStream}
                metrics={parisMetrics}
                isConnected={parisConnected}
                accentColor="paris"
                noSignalMessage="En attente du flux Paris..."
                showInlineStats={!showDetailedStats}
                connectionState={parisWebRTC.connectionState}
                isSenderAvailable={signaling.connectedPeers.includes(
                  NodeId.PARIS,
                )}
                isLoading={parisLoading}
                obsReceiverId={NodeId.OBS_NANTES}
                isObsConnected={signaling.connectedPeers.includes(
                  NodeId.OBS_NANTES,
                )}
                manuallyStopped={parisManuallyStopped}
                onStreamControl={(action) => {
                  signaling.sendStreamControl(NodeId.PARIS, action);
                  if (action === "stop") {
                    parisStopByOperator.current = true;
                    setParisLoading("stopping");
                  } else {
                    setParisLoading("starting");
                    addParisLog("Démarrage demandé par l'opérateur", "info");
                  }
                }}
              />
              {showDetailedStats && (
                <StatsPanel
                  metrics={parisMetrics}
                  isStreaming={parisConnected}
                  hideBandwidth
                />
              )}
            </div>
          </div>

          {/* Console Logs - one per city */}
          <div
            className={
              stackedLayout ? "space-y-4" : "grid gap-4 lg:grid-cols-2"
            }
          >
            <ConsoleLog
              entries={nantesLogs}
              accentColor="nantes"
              onClear={() => setNantesLogs([])}
              title="🐘 Console Nantes"
            />
            <ConsoleLog
              entries={parisLogs}
              accentColor="paris"
              onClear={() => setParisLogs([])}
              title="🗼 Console Paris"
            />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
