import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { StatsPanel } from "@/components/dashboard/StatsPanel";
import {
  loadOperatorSettings,
  OperatorHeader,
  type OperatorSettings,
  OperatorSettingsSheet,
  saveOperatorSettings,
  VideoPanel,
} from "@/components/operator";
import {
  ConsoleLog,
  createLogEntry,
  type LogEntry,
} from "@/components/shared/ConsoleLog";
import { Sheet } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConnectionState } from "@/constants/connection-states";
import { generateOperatorNodeId, NodeId } from "@/constants/node-ids";
import { useOperatorManager } from "@/hooks";
import { useStore } from "@/stores";

export const Route = createFileRoute("/receivers/operator")({
  component: OperatorDashboard,
});

function OperatorDashboard() {
  // Generate a unique ID for this operator instance (allows multiple tabs)
  const [nodeId] = useState(() => generateOperatorNodeId());

  // Logs per city
  const [nantesLogs, setNantesLogs] = useState<LogEntry[]>([]);
  const [parisLogs, setParisLogs] = useState<LogEntry[]>([]);

  // Settings state - persisted to localStorage
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<OperatorSettings>(() =>
    loadOperatorSettings(),
  );

  // Persist settings when they change
  useEffect(() => {
    saveOperatorSettings(settings);
  }, [settings]);

  const handleSettingsChange = useCallback(
    (updates: Partial<OperatorSettings>) => {
      setSettings((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  // Log handlers per source
  const addLog = useCallback(
    (
      sourceId: NodeId,
      message: string,
      level: "info" | "warning" | "error" | "success" = "info",
    ) => {
      if (sourceId === NodeId.NANTES) {
        setNantesLogs((prev) => [
          ...prev.slice(-50),
          createLogEntry(message, level),
        ]);
      } else if (sourceId === NodeId.PARIS) {
        setParisLogs((prev) => [
          ...prev.slice(-50),
          createLogEntry(message, level),
        ]);
      }
    },
    [],
  );

  // Initialize operator manager
  const operator = useOperatorManager({
    nodeId,
    sources: [NodeId.NANTES, NodeId.PARIS],
    onLog: addLog,
  });

  // Connect on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: connect is stable, run once on mount
  useEffect(() => {
    operator.connect();
  }, []);

  // Get metrics from store
  const peerMetrics = useStore((s) => s.peerMetrics);
  const nantesMetrics = peerMetrics.get(NodeId.NANTES) ?? null;
  const parisMetrics = peerMetrics.get(NodeId.PARIS) ?? null;

  // Get source states
  const nantesState = operator.getSourceState(NodeId.NANTES);
  const parisState = operator.getSourceState(NodeId.PARIS);

  const nantesConnected =
    nantesState.connectionState === ConnectionState.CONNECTED;
  const parisConnected =
    parisState.connectionState === ConnectionState.CONNECTED;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          {/* Header */}
          <OperatorHeader
            isSignalingConnected={operator.isSignalingConnected}
          />

          {/* Settings Sheet */}
          <OperatorSettingsSheet
            settings={settings}
            onSettingsChange={handleSettingsChange}
            connectionInfo={{
              isSignalingConnected: operator.isSignalingConnected,
              connectedPeers: operator.connectedPeers,
              nantesConnected,
              parisConnected,
            }}
          />
        </Sheet>

        {/* Main Content */}
        <main className="container mx-auto space-y-4 p-4">
          {/* Video Grid */}
          <div
            className={
              settings.stackedLayout ? "space-y-4" : "grid gap-4 lg:grid-cols-2"
            }
          >
            {/* Nantes */}
            <div className="space-y-4">
              <VideoPanel
                title="Nantes"
                emoji="🐘"
                stream={nantesState.remoteStream}
                metrics={nantesMetrics}
                isConnected={nantesConnected}
                accentColor="nantes"
                noSignalMessage="En attente du flux Nantes..."
                showInlineStats={!settings.showDetailedStats}
                connectionState={nantesState.connectionState}
                isSenderAvailable={operator.isSourceAvailable(NodeId.NANTES)}
                isLoading={nantesState.loading}
                obsReceiverId={NodeId.OBS_PARIS}
                isObsConnected={operator.connectedPeers.includes(
                  NodeId.OBS_PARIS,
                )}
                manuallyStopped={nantesState.manuallyStopped}
                onStreamControl={(action) => {
                  operator.sendStreamControl(NodeId.NANTES, action);
                }}
              />
              {settings.showDetailedStats && (
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
                stream={parisState.remoteStream}
                metrics={parisMetrics}
                isConnected={parisConnected}
                accentColor="paris"
                noSignalMessage="En attente du flux Paris..."
                showInlineStats={!settings.showDetailedStats}
                connectionState={parisState.connectionState}
                isSenderAvailable={operator.isSourceAvailable(NodeId.PARIS)}
                isLoading={parisState.loading}
                obsReceiverId={NodeId.OBS_NANTES}
                isObsConnected={operator.connectedPeers.includes(
                  NodeId.OBS_NANTES,
                )}
                manuallyStopped={parisState.manuallyStopped}
                onStreamControl={(action) => {
                  operator.sendStreamControl(NodeId.PARIS, action);
                }}
              />
              {settings.showDetailedStats && (
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
              settings.stackedLayout ? "space-y-4" : "grid gap-4 lg:grid-cols-2"
            }
          >
            <ConsoleLog
              entries={nantesLogs}
              accentColor="nantes"
              onClear={() => setNantesLogs([])}
              title="Console Nantes"
            />
            <ConsoleLog
              entries={parisLogs}
              accentColor="paris"
              onClear={() => setParisLogs([])}
              title="Console Paris"
            />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
