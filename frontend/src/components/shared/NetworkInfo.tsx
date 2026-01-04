import { Cable, HelpCircle, Signal, Smartphone, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  getNavigatorConnection,
  type NetworkEffectiveType,
} from "@/types/navigator";

type NetworkType = "wifi" | "cellular" | "ethernet" | "unknown";

interface NetworkConnectionState {
  type: NetworkType;
  effectiveType?: NetworkEffectiveType;
  downlink?: number; // Mbps
  rtt?: number; // ms
}

function getNetworkInfo(): NetworkConnectionState {
  const connection = getNavigatorConnection();

  if (!connection) {
    return { type: "unknown" };
  }

  let type: NetworkType = "unknown";
  const connectionType = connection.type;

  if (connectionType === "wifi") {
    type = "wifi";
  } else if (connectionType === "cellular") {
    type = "cellular";
  } else if (connectionType === "ethernet") {
    type = "ethernet";
  }

  return {
    type,
    effectiveType: connection.effectiveType,
    downlink: connection.downlink,
    rtt: connection.rtt,
  };
}

const networkIcons: Record<NetworkType, typeof Wifi> = {
  wifi: Wifi,
  cellular: Smartphone,
  ethernet: Cable,
  unknown: HelpCircle,
};

const networkLabels: Record<NetworkType, string> = {
  wifi: "Wi-Fi",
  cellular: "Cellulaire",
  ethernet: "Ethernet",
  unknown: "Inconnu",
};

const effectiveTypeLabels: Record<string, string> = {
  "slow-2g": "Très lent",
  "2g": "2G",
  "3g": "3G",
  "4g": "4G/LTE",
};

interface NetworkTypeBadgeProps {
  className?: string;
}

/**
 * Displays the current network connection type
 * Uses Navigator.connection API (Chrome/Edge/Opera)
 */
export function NetworkTypeBadge({ className }: NetworkTypeBadgeProps) {
  const [networkInfo, setNetworkInfo] = useState<NetworkConnectionState>(() =>
    getNetworkInfo(),
  );

  useEffect(() => {
    const connection = getNavigatorConnection();

    if (!connection) return;

    const handleChange = () => {
      setNetworkInfo(getNetworkInfo());
    };

    connection.addEventListener("change", handleChange);
    return () => connection.removeEventListener("change", handleChange);
  }, []);

  const Icon = networkIcons[networkInfo.type];
  const label = networkLabels[networkInfo.type];
  const effectiveLabel = networkInfo.effectiveType
    ? effectiveTypeLabels[networkInfo.effectiveType]
    : null;

  // Color based on effective type
  const getColorClass = () => {
    if (!networkInfo.effectiveType) return "text-muted-foreground";
    switch (networkInfo.effectiveType) {
      case "4g":
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
      case "3g":
        return "border-lime-500/30 bg-lime-500/10 text-lime-500";
      case "2g":
        return "border-amber-500/30 bg-amber-500/10 text-amber-500";
      case "slow-2g":
        return "border-red-500/30 bg-red-500/10 text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  const badge = (
    <Badge
      variant="outline"
      className={cn("gap-1.5 cursor-help", getColorClass(), className)}
    >
      <Icon className="h-3 w-3" />
      {label}
      {effectiveLabel && ` (${effectiveLabel})`}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Connexion réseau</p>
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <p>Type : {label}</p>
            {effectiveLabel && <p>Qualité : {effectiveLabel}</p>}
            {networkInfo.downlink && (
              <p>Débit estimé : {networkInfo.downlink.toFixed(1)} Mbps</p>
            )}
            {networkInfo.rtt && (
              <p>Latence estimée : {Math.round(networkInfo.rtt)} ms</p>
            )}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface BandwidthDisplayProps {
  /** Available outgoing bandwidth in kbps */
  availableBandwidth?: number;
  /** Current bitrate in kbps */
  currentBitrate?: number;
  /** Size variant */
  size?: "sm" | "md";
  className?: string;
}

function formatBandwidth(kbps: number): string {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  if (kbps >= 1) return `${Math.round(kbps)} kbps`;
  return `${kbps.toFixed(1)} kbps`;
}

/**
 * Displays bandwidth usage: current bitrate vs available bandwidth
 */
export function BandwidthDisplay({
  availableBandwidth,
  currentBitrate,
  size = "md",
  className,
}: BandwidthDisplayProps) {
  if (!availableBandwidth || availableBandwidth <= 0) {
    return null;
  }

  const usagePercent = currentBitrate
    ? Math.min(100, (currentBitrate / availableBandwidth) * 100)
    : 0;

  // Color based on usage
  const getColorClass = () => {
    if (usagePercent > 90) return "text-red-500";
    if (usagePercent > 70) return "text-amber-500";
    if (usagePercent > 50) return "text-lime-500";
    return "text-emerald-500";
  };

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-mono tabular-nums cursor-help",
        getColorClass(),
        size === "sm" && "text-xs px-1.5 py-0.5",
        className,
      )}
    >
      <Signal
        className={cn("shrink-0", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")}
      />
      {formatBandwidth(currentBitrate ?? 0)} /{" "}
      {formatBandwidth(availableBandwidth)}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Utilisation bande passante</p>
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <p>Bitrate actuel : {formatBandwidth(currentBitrate ?? 0)}</p>
            <p>
              Bande passante disponible : {formatBandwidth(availableBandwidth)}
            </p>
            <p>Utilisation : {usagePercent.toFixed(0)}%</p>
          </div>
          <div className="pt-1">
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  usagePercent > 90
                    ? "bg-red-500"
                    : usagePercent > 70
                      ? "bg-amber-500"
                      : usagePercent > 50
                        ? "bg-lime-500"
                        : "bg-emerald-500",
                )}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
