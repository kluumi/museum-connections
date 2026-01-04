import { StatusIndicator, type StatusType } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { ConnectionState, SignalingState } from "@/constants/connection-states";
import { cn } from "@/lib/utils";

interface ConnectionStatusProps {
  signalingState: SignalingState;
  webrtcState: ConnectionState;
  accentColor?: "nantes" | "paris";
  className?: string;
}

function getSignalingStatus(state: SignalingState): {
  status: StatusType;
  label: string;
} {
  switch (state) {
    case SignalingState.CONNECTED:
      return { status: "online", label: "CONNECTÉ" };
    case SignalingState.CONNECTING:
    case SignalingState.RECONNECTING:
      return { status: "pending", label: "CONNEXION..." };
    case SignalingState.DISCONNECTED:
      return { status: "offline", label: "DÉCONNECTÉ" };
    default:
      return { status: "offline", label: "DÉCONNECTÉ" };
  }
}

function getWebRTCStatus(state: ConnectionState): {
  status: StatusType;
  label: string;
} {
  switch (state) {
    case ConnectionState.CONNECTED:
      return { status: "online", label: "CONNECTÉ" };
    case ConnectionState.CONNECTING:
    case ConnectionState.RECONNECTING:
      return { status: "pending", label: "NÉGOCIATION..." };
    case ConnectionState.DISCONNECTED:
    case ConnectionState.FAILED:
      return { status: "offline", label: "HORS LIGNE" };
    default:
      return { status: "offline", label: "HORS LIGNE" };
  }
}

const accentBorderColors = {
  nantes: {
    online:
      "border-l-[var(--nantes)] shadow-[inset_4px_0_8px_-4px_var(--nantes-glow)]",
    pending: "border-l-[var(--status-pending)]",
    offline: "border-l-[var(--status-offline)]",
  },
  paris: {
    online:
      "border-l-[var(--paris)] shadow-[inset_4px_0_8px_-4px_var(--paris-glow)]",
    pending: "border-l-[var(--status-pending)]",
    offline: "border-l-[var(--status-offline)]",
  },
};

function StatusCard({
  title,
  status,
  label,
  accentColor,
}: {
  title: string;
  status: StatusType;
  label: string;
  accentColor: "nantes" | "paris";
}) {
  return (
    <Card
      className={cn(
        "border-l-4 bg-card",
        accentBorderColors[accentColor][status],
      )}
    >
      <CardContent className="flex items-center gap-3 p-3">
        <StatusIndicator status={status} size="md" />
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="text-sm font-bold">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ConnectionStatus({
  signalingState,
  webrtcState,
  accentColor = "nantes",
  className,
}: ConnectionStatusProps) {
  const signaling = getSignalingStatus(signalingState);
  const webrtc = getWebRTCStatus(webrtcState);

  return (
    <div className={cn("flex flex-wrap gap-4", className)}>
      <StatusCard
        title="Signalisation Railway"
        status={signaling.status}
        label={signaling.label}
        accentColor={accentColor}
      />
      <StatusCard
        title="Lien WebRTC (Flux)"
        status={webrtc.status}
        label={webrtc.label}
        accentColor={accentColor}
      />
    </div>
  );
}
