import { useEffect, useState } from "react";
import { HelpCircle, Signal, Wifi } from "lucide-react";
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

interface NetworkConnectionState {
  effectiveType?: NetworkEffectiveType;
  downlink?: number;
  rtt?: number;
  isSupported: boolean;
}

function getNetworkInfo(): NetworkConnectionState {
  const connection = getNavigatorConnection();

  if (!connection) {
    return { isSupported: false };
  }

  return {
    effectiveType: connection.effectiveType,
    downlink: connection.downlink,
    rtt: connection.rtt,
    isSupported: true,
  };
}

const effectiveTypeInfo: Record<
  string,
  { label: string; description: string; color: string; icon: typeof Signal }
> = {
  "slow-2g": {
    label: "Très lent",
    description: "~50 kbps",
    color: "text-red-500",
    icon: Signal,
  },
  "2g": {
    label: "Lent",
    description: "~70 kbps",
    color: "text-red-500",
    icon: Signal,
  },
  "3g": {
    label: "Moyen",
    description: "~700 kbps",
    color: "text-amber-500",
    icon: Signal,
  },
  "4g": {
    label: "Rapide",
    description: "> 4 Mbps",
    color: "text-emerald-500",
    icon: Wifi,
  },
};

function getBackgroundColor(color: string | undefined): string {
  if (!color) return "bg-muted";
  if (color === "text-emerald-500") return "bg-emerald-500/10";
  if (color === "text-amber-500") return "bg-amber-500/10";
  return "bg-red-500/10";
}

export function NetworkSpeedIndicator() {
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

  const networkQuality = networkInfo.effectiveType
    ? effectiveTypeInfo[networkInfo.effectiveType]
    : null;
  const NetworkIcon = networkQuality?.icon ?? Signal;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-3 cursor-help">
          <div
            className={cn(
              "rounded-lg p-2",
              getBackgroundColor(networkQuality?.color),
            )}
          >
            <NetworkIcon
              className={cn(
                "h-4 w-4",
                networkQuality?.color ?? "text-muted-foreground",
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="text-xs text-muted-foreground">Vitesse réseau</p>
              <HelpCircle className="h-3 w-3 text-muted-foreground/50" />
            </div>
            <p
              className={cn(
                "font-medium text-sm",
                networkQuality?.color ?? "text-muted-foreground",
              )}
            >
              {networkQuality
                ? networkQuality.label
                : networkInfo.isSupported
                  ? "Mesure..."
                  : "Non disponible"}
              {networkQuality && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({networkQuality.description})
                </span>
              )}
            </p>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Catégorie de vitesse réseau</p>
          <div className="space-y-0.5 text-xs">
            <p>
              <span className="text-emerald-500">■</span> Rapide : &gt; 4 Mbps
              (4G/LTE)
            </p>
            <p>
              <span className="text-amber-500">■</span> Moyen : ~700 kbps (3G)
            </p>
            <p>
              <span className="text-red-500">■</span> Lent : &lt; 100 kbps (2G)
            </p>
          </div>
          {(networkInfo.downlink || networkInfo.rtt) && (
            <div className="space-y-0.5 text-xs text-muted-foreground pt-1 border-t mt-1">
              {networkInfo.downlink && (
                <p>Débit estimé : {networkInfo.downlink.toFixed(1)} Mbps</p>
              )}
              {networkInfo.rtt && (
                <p>Latence estimée : {Math.round(networkInfo.rtt)} ms</p>
              )}
            </div>
          )}
          <p className="text-muted-foreground pt-1">
            Estimation du navigateur basée sur les conditions réseau récentes.
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
