import { StatusIndicator, type StatusType } from "@/components/shared";
import { ConnectionState, SignalingState } from "@/constants/connection-states";
import type { NodeId } from "@/constants/node-ids";
import { cn } from "@/lib/utils";

interface StatusBarProps {
  signalingState: SignalingState;
  sourceStates: Map<NodeId, ConnectionState>;
  receiverStates: Map<NodeId, boolean>;
  className?: string;
}

function getSignalingStatus(state: SignalingState): StatusType {
  switch (state) {
    case SignalingState.CONNECTED:
      return "online";
    case SignalingState.CONNECTING:
    case SignalingState.RECONNECTING:
      return "pending";
    default:
      return "offline";
  }
}

function getConnectionStatus(state: ConnectionState | undefined): StatusType {
  if (!state) return "offline";
  switch (state) {
    case ConnectionState.CONNECTED:
      return "online";
    case ConnectionState.CONNECTING:
      return "pending";
    default:
      return "offline";
  }
}

function StatusItem({
  label,
  status,
  colorClass,
}: {
  label: string;
  status: StatusType;
  colorClass?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-2">
      <StatusIndicator status={status} size="sm" />
      <span className={cn("text-sm font-medium", colorClass)}>{label}</span>
    </div>
  );
}

export function StatusBar({
  signalingState,
  sourceStates,
  receiverStates,
  className,
}: StatusBarProps) {
  const serverStatus = getSignalingStatus(signalingState);
  const nantesStatus = getConnectionStatus(
    sourceStates.get("nantes" as NodeId),
  );
  const parisStatus = getConnectionStatus(sourceStates.get("paris" as NodeId));
  const obsNantesStatus = receiverStates.get("obs_nantes" as NodeId)
    ? "online"
    : "offline";
  const obsParisStatus = receiverStates.get("obs_paris" as NodeId)
    ? "online"
    : "offline";

  return (
    <div className={cn("space-y-3", className)}>
      {/* Row 1: Server and Sources */}
      <div className="flex flex-wrap justify-center gap-3">
        <StatusItem label="SERVEUR" status={serverStatus} />
        <StatusItem
          label="NANTES"
          status={nantesStatus}
          colorClass="text-[var(--nantes)]"
        />
        <StatusItem
          label="PARIS"
          status={parisStatus}
          colorClass="text-[var(--paris)]"
        />
      </div>

      {/* Row 2: Receivers */}
      <div className="flex flex-wrap justify-center gap-3">
        <StatusItem label="OBS NANTES" status={obsNantesStatus} />
        <StatusItem label="OBS PARIS" status={obsParisStatus} />
      </div>
    </div>
  );
}
