import {
  CircleOff,
  Loader2,
  Monitor,
  Radio,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConnectionState } from "@/constants/connection-states";
import { NODE_TARGETS, NodeId, type SenderNodeId } from "@/constants/node-ids";
import { cn } from "@/lib/utils";

interface ConnectionBadgeProps {
  connected: boolean;
  label: string;
  icon: React.ElementType;
  disconnectedRed?: boolean;
}

const connectedStyle =
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";

export function ConnectionBadge({
  connected,
  label,
  icon: Icon,
  disconnectedRed = false,
}: ConnectionBadgeProps) {
  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5",
        connected
          ? connectedStyle
          : disconnectedRed
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );

  return badge;
}

export function SignalingBadge({ connected }: { connected: boolean }) {
  const label = connected ? "Serveur connecté" : "Serveur hors ligne";
  const Icon = connected ? Wifi : WifiOff;

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 cursor-help",
        connected
          ? connectedStyle
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Serveur de signalisation</p>
          <div className="space-y-0.5 text-xs">
            <p>
              <span className="text-emerald-500">■</span> Connecté :
              Communication active
            </p>
            <p>
              <span className="text-red-500">■</span> Hors ligne : Impossible
              d'établir les connexions
            </p>
          </div>
          <p className="text-muted-foreground pt-1">
            Le serveur de signalisation permet l'échange des informations de
            connexion WebRTC.
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface StreamingBadgeProps {
  state: ConnectionState;
  /** Target name for tooltip (e.g., "OBS Paris") */
  targetName?: string;
  /** If true, show "Arrêté" instead of "Reconnexion..." when state is RECONNECTING */
  manuallyStopped?: boolean;
}

/**
 * Shows the streaming status (WebRTC connection state)
 * - En direct: actively streaming
 * - Connexion: negotiating WebRTC
 * - Arrêté: not streaming
 */
export function StreamingBadge({
  state,
  targetName,
  manuallyStopped = false,
}: StreamingBadgeProps) {
  // When manually stopped, treat RECONNECTING as DISCONNECTED (show "Arrêté" not "Reconnexion...")
  const effectiveState =
    manuallyStopped && state === ConnectionState.RECONNECTING
      ? ConnectionState.DISCONNECTED
      : state;

  const isConnecting =
    effectiveState === ConnectionState.CONNECTING ||
    effectiveState === ConnectionState.RECONNECTING;
  const isConnected = effectiveState === ConnectionState.CONNECTED;
  const isFailed = effectiveState === ConnectionState.FAILED;

  const getDisplayLabel = () => {
    switch (effectiveState) {
      case ConnectionState.CONNECTED:
        return "En direct";
      case ConnectionState.CONNECTING:
        return "Connexion...";
      case ConnectionState.RECONNECTING:
        return "Reconnexion...";
      case ConnectionState.FAILED:
        return "Échec";
      default:
        return "Arrêté";
    }
  };

  const Icon = isConnecting ? Loader2 : isConnected ? Radio : CircleOff;

  const className = isConnected
    ? "border-red-500/30 bg-red-500/10 text-red-500"
    : isConnecting
      ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
      : isFailed
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "text-muted-foreground";

  const getStateDescription = () => {
    switch (effectiveState) {
      case ConnectionState.CONNECTED:
        return "Flux vidéo/audio en cours de diffusion.";
      case ConnectionState.CONNECTING:
        return "Établissement de la connexion WebRTC...";
      case ConnectionState.RECONNECTING:
        return "Reconnexion en cours...";
      case ConnectionState.FAILED:
        return "La connexion a échoué.";
      default:
        return "Aucune diffusion active.";
    }
  };

  const badge = (
    <Badge variant="outline" className={cn("gap-1.5 cursor-help", className)}>
      <Icon className={cn("h-3 w-3", isConnecting && "animate-spin")} />
      {getDisplayLabel()}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            Diffusion{targetName ? ` vers ${targetName}` : ""}
          </p>
          <p className="text-muted-foreground">{getStateDescription()}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// Keep old name for backwards compatibility
export const WebRTCBadge = StreamingBadge;

interface ReceiverStatusBadgeProps {
  /** The sender node ID to check receiver for */
  senderNodeId: SenderNodeId;
  /** List of currently connected peers from signaling */
  connectedPeers: NodeId[];
}

/**
 * Shows status of the OBS receiver for a sender dashboard
 * - Nantes sender → OBS Paris
 * - Paris sender → OBS Nantes
 */
export function ReceiverStatusBadge({
  senderNodeId,
  connectedPeers,
}: ReceiverStatusBadgeProps) {
  const targets = NODE_TARGETS[senderNodeId];

  // Get the OBS receiver target for this sender
  const obsTarget = targets.find((t) => t.startsWith("obs_"));
  const obsConnected = obsTarget ? connectedPeers.includes(obsTarget) : false;

  const obsLabel = senderNodeId === NodeId.NANTES ? "OBS Paris" : "OBS Nantes";

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 cursor-help",
        obsConnected ? connectedStyle : "text-muted-foreground",
      )}
    >
      <Monitor className="h-3 w-3" />
      {obsConnected ? `${obsLabel} prêt` : `${obsLabel} hors ligne`}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">{obsLabel}</p>
          <p className="text-muted-foreground">
            {obsConnected
              ? "Le récepteur OBS est connecté et prêt à recevoir le flux."
              : "Le récepteur OBS n'est pas connecté au serveur."}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
