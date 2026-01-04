import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  Gauge,
  HelpCircle,
  ImageOff,
  MonitorPlay,
  Network,
  Radio,
  Signal,
  Timer,
  Waves,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PeerMetrics } from "@/types/metrics";
import {
  getNavigatorConnection,
  type NetworkEffectiveType,
} from "@/types/navigator";

// Network connection info for component state
// Note: The "type" property (wifi/cellular/ethernet) is rarely available on desktop browsers
// The "effectiveType" (4g/3g/2g) indicates connection quality, not the physical medium
interface NetworkConnectionState {
  effectiveType?: NetworkEffectiveType;
  downlink?: number; // Estimated bandwidth in Mbps
  rtt?: number; // Estimated RTT in ms
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

// Effective type represents connection quality (speed category), not physical medium
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

interface StatsPanelProps {
  metrics: PeerMetrics | null;
  className?: string;
  /** Whether the stream is active - shows placeholder when not streaming */
  isStreaming?: boolean;
  /** Hide bandwidth stat (useful for receivers where it's unreliable) */
  hideBandwidth?: boolean;
}

function formatBitrate(kbps: number): string {
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  if (kbps >= 1) {
    return `${Math.round(kbps)} kbps`;
  }
  return `${kbps.toFixed(1)} kbps`;
}

type WarningSeverity = "none" | "warning" | "error";

// Helper functions moved outside component to avoid recreation on every render
function getQualityStyle(score: number) {
  if (score >= 80)
    return {
      label: "Excellent",
      color: "text-emerald-500",
      progress: "[&>div]:bg-emerald-500",
    };
  if (score >= 60)
    return {
      label: "Bon",
      color: "text-lime-500",
      progress: "[&>div]:bg-lime-500",
    };
  if (score >= 40)
    return {
      label: "Moyen",
      color: "text-amber-500",
      progress: "[&>div]:bg-amber-500",
    };
  return {
    label: "Faible",
    color: "text-red-500",
    progress: "[&>div]:bg-red-500",
  };
}

function getSeverity(
  value: number | undefined,
  thresholds: { warning: number; error: number },
  higher: boolean = true, // true = higher is worse, false = lower is worse
): WarningSeverity {
  if (value === undefined || value === 0) return "none";
  if (higher) {
    if (value > thresholds.error) return "error";
    if (value > thresholds.warning) return "warning";
  } else {
    if (value < thresholds.error) return "error";
    if (value < thresholds.warning) return "warning";
  }
  return "none";
}

const severityStyles = {
  none: { bg: "", icon: "text-muted-foreground", text: "text-emerald-500" },
  warning: {
    bg: "bg-amber-500/20",
    icon: "text-amber-500",
    text: "text-amber-500",
  },
  error: { bg: "bg-red-500/20", icon: "text-red-500", text: "text-red-500" },
};

interface TooltipInfo {
  title: string;
  description: string;
  thresholds?: {
    excellent?: string;
    good?: string;
    warning?: string;
    error?: string;
  };
}

function StatItem({
  icon: Icon,
  label,
  value,
  subValue,
  severity = "none",
  tooltip,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  severity?: WarningSeverity;
  tooltip?: TooltipInfo;
}) {
  const currentStyle = severityStyles[severity];

  const content = (
    <div className="flex items-center gap-3">
      <div className={cn("rounded-lg bg-muted p-2", currentStyle.bg)}>
        <Icon className={cn("h-4 w-4", currentStyle.icon)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          {tooltip && (
            <HelpCircle className="h-3 w-3 text-muted-foreground/50" />
          )}
        </div>
        <p className={cn("font-mono text-sm font-medium", currentStyle.text)}>
          {value}
          {subValue && (
            <span className="ml-1 text-xs text-muted-foreground">
              {subValue}
            </span>
          )}
        </p>
      </div>
    </div>
  );

  if (!tooltip) {
    return content;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help">{content}</div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">{tooltip.title}</p>
          {tooltip.thresholds && (
            <div className="space-y-0.5 text-xs">
              {tooltip.thresholds.excellent && (
                <p>
                  <span className="text-emerald-500">■</span>{" "}
                  {tooltip.thresholds.excellent}
                </p>
              )}
              {tooltip.thresholds.good && (
                <p>
                  <span className="text-lime-500">■</span>{" "}
                  {tooltip.thresholds.good}
                </p>
              )}
              {tooltip.thresholds.warning && (
                <p>
                  <span className="text-amber-500">■</span>{" "}
                  {tooltip.thresholds.warning}
                </p>
              )}
              {tooltip.thresholds.error && (
                <p>
                  <span className="text-red-500">■</span>{" "}
                  {tooltip.thresholds.error}
                </p>
              )}
            </div>
          )}
          <p className="text-muted-foreground pt-1">{tooltip.description}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function StatsPanel({
  metrics,
  className,
  isStreaming = true,
  hideBandwidth = false,
}: StatsPanelProps) {
  const video = metrics?.video;
  const connection = metrics?.connection;
  const qualityScore = metrics?.qualityScore ?? 0;

  const quality = getQualityStyle(qualityScore);

  const rttSeverity = getSeverity(connection?.rtt, {
    warning: 150,
    error: 300,
  });
  const packetLossSeverity = getSeverity(video?.packetLoss, {
    warning: 2,
    error: 5,
  });
  const fpsSeverity = getSeverity(
    video?.fps,
    { warning: 24, error: 15 },
    false,
  );
  const jitterSeverity = getSeverity(video?.jitter, { warning: 20, error: 50 });
  const bitrateSeverity = getSeverity(
    video?.bitrate,
    { warning: 1000, error: 500 },
    false,
  );
  const resolutionSeverity = getSeverity(
    video?.height,
    { warning: 720, error: 480 },
    false,
  );

  // Bandwidth estimation - only use outgoing (for senders), incoming is unreliable
  const availableBandwidth = connection?.availableOutgoingBitrate || 0;
  // Low bandwidth warning if less than 2 Mbps, error if less than 1 Mbps
  const bandwidthSeverity = getSeverity(
    availableBandwidth,
    { warning: 2000, error: 1000 },
    false,
  );

  // Network connection info (Navigator.connection API)
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

  // Bandwidth usage calculation
  const currentBitrate = video?.bitrate ?? 0;
  const bandwidthUsagePercent =
    availableBandwidth > 0
      ? Math.min(100, (currentBitrate / availableBandwidth) * 100)
      : 0;

  const getBandwidthUsageColor = () => {
    if (bandwidthUsagePercent > 90) return "text-red-500";
    if (bandwidthUsagePercent > 70) return "text-amber-500";
    if (bandwidthUsagePercent > 50) return "text-lime-500";
    return "text-emerald-500";
  };

  // Get network quality info - effectiveType indicates speed category
  const networkQuality = networkInfo.effectiveType
    ? effectiveTypeInfo[networkInfo.effectiveType]
    : null;
  const NetworkIcon = networkQuality?.icon ?? Signal;

  return (
    <Card className={cn(className, !isStreaming && "opacity-60")}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Qualité du flux
          </CardTitle>
          {isStreaming ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-3 cursor-help">
                  <span className={cn("text-sm font-medium", quality.color)}>
                    {quality.label}
                  </span>
                  <span
                    className={cn("font-mono text-lg font-bold", quality.color)}
                  >
                    {qualityScore}
                    <span className="text-xs text-muted-foreground">/100</span>
                  </span>
                  <HelpCircle className="h-4 w-4 text-muted-foreground/50" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Score de qualité</p>
                  <div className="space-y-0.5 text-xs">
                    <p>
                      <span className="text-emerald-500">■</span> 80-100 :
                      Excellent
                    </p>
                    <p>
                      <span className="text-lime-500">■</span> 60-79 : Bon
                    </p>
                    <p>
                      <span className="text-amber-500">■</span> 40-59 : Moyen
                    </p>
                    <p>
                      <span className="text-red-500">■</span> 0-39 : Faible
                    </p>
                  </div>
                  <p className="text-muted-foreground pt-1">
                    Basé sur la latence, pertes, FPS, jitter, bitrate,
                    résolution, bande passante et images perdues.
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-sm text-muted-foreground">
              En attente de diffusion
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quality Progress Bar */}
        <Progress
          value={isStreaming ? qualityScore : 0}
          className={cn("h-1.5", isStreaming ? quality.progress : "")}
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatItem
            icon={Timer}
            label="Latence (RTT)"
            value={connection?.rtt ? `${connection.rtt.toFixed(0)} ms` : "-"}
            severity={rttSeverity}
            tooltip={{
              title: "Latence (Round-Trip Time)",
              thresholds: {
                excellent: "< 50 ms : Excellent",
                good: "50-150 ms : Bon",
                warning: "150-300 ms : Moyen",
                error: "> 300 ms : Problématique",
              },
              description:
                "Temps aller-retour des paquets entre vous et le destinataire.",
            }}
          />
          <StatItem
            icon={Gauge}
            label="Bitrate"
            value={
              video?.bitrate
                ? formatBitrate(video.bitrate)
                : video?.fps || video?.width
                  ? "Calcul..." // First collection - bitrate needs 2 samples
                  : "-"
            }
            severity={bitrateSeverity}
            tooltip={{
              title: "Bitrate vidéo",
              thresholds: {
                excellent: "> 3 Mbps : Excellent (1080p)",
                good: "1-3 Mbps : Bon (720p)",
                warning: "0.5-1 Mbps : Moyen (480p)",
                error: "< 500 kbps : Faible",
              },
              description:
                "Débit de données vidéo envoyées. Plus élevé = meilleure qualité.",
            }}
          />
          {!hideBandwidth && (
            <StatItem
              icon={ArrowUpDown}
              label="Bande passante"
              value={
                availableBandwidth > 0 ? formatBitrate(availableBandwidth) : "-"
              }
              subValue="dispo."
              severity={bandwidthSeverity}
              tooltip={{
                title: "Bande passante disponible",
                thresholds: {
                  excellent: "> 5 Mbps : Excellent",
                  good: "2-5 Mbps : Bon",
                  warning: "1-2 Mbps : Limite",
                  error: "< 1 Mbps : Insuffisant",
                },
                description:
                  "Capacité réseau estimée. Doit être supérieure au bitrate.",
              }}
            />
          )}
          <StatItem
            icon={MonitorPlay}
            label="Framerate"
            value={video?.fps ? `${Math.round(video.fps)} fps` : "-"}
            severity={fpsSeverity}
            tooltip={{
              title: "Framerate (FPS)",
              thresholds: {
                excellent: "> 30 fps : Très fluide",
                good: "24-30 fps : Fluide",
                warning: "15-24 fps : Saccades légères",
                error: "< 15 fps : Saccades visibles",
              },
              description: "Nombre d'images par seconde du flux vidéo.",
            }}
          />
          <StatItem
            icon={AlertTriangle}
            label="Pertes"
            value={
              video?.packetLoss !== undefined
                ? `${video.packetLoss.toFixed(1)}%`
                : "-"
            }
            severity={packetLossSeverity}
            tooltip={{
              title: "Perte de paquets",
              thresholds: {
                excellent: "< 1% : Excellent",
                good: "1-2% : Acceptable",
                warning: "2-5% : Dégradation visible",
                error: "> 5% : Artefacts, freezes",
              },
              description:
                "Paquets réseau perdus en transit. Affecte la qualité vidéo.",
            }}
          />
          <StatItem
            icon={Waves}
            label="Jitter"
            value={
              video?.jitter !== undefined
                ? `${video.jitter.toFixed(1)} ms`
                : "-"
            }
            severity={jitterSeverity}
            tooltip={{
              title: "Jitter (Gigue)",
              thresholds: {
                excellent: "< 10 ms : Très stable",
                good: "10-20 ms : Stable",
                warning: "20-50 ms : Instable",
                error: "> 50 ms : Très instable",
              },
              description:
                "Variation du délai entre paquets. Peut causer des saccades.",
            }}
          />
          <StatItem
            icon={MonitorPlay}
            label="Résolution"
            value={
              video?.width && video?.height
                ? `${video.width}x${video.height}`
                : "-"
            }
            subValue={video?.codec ? `(${video.codec})` : undefined}
            severity={resolutionSeverity}
            tooltip={{
              title: "Résolution vidéo",
              thresholds: {
                excellent: "1080p (1920×1080) : Full HD",
                good: "720p (1280×720) : HD",
                warning: "480p (854×480) : SD",
                error: "< 480p : Basse qualité",
              },
              description:
                "Dimensions de l'image. VP9/H264 offrent meilleure compression.",
            }}
          />
          <StatItem
            icon={ImageOff}
            label="Images perdues"
            value={
              video?.framesDropped !== undefined
                ? video.framesDropped.toString()
                : "-"
            }
            severity={getSeverity(video?.framesDropped, {
              warning: 10,
              error: 50,
            })}
            tooltip={{
              title: "Images perdues (Frames dropped)",
              thresholds: {
                excellent: "0 : Parfait",
                good: "1-10 : Acceptable",
                warning: "10-50 : CPU/GPU surchargé",
                error: "> 50 : Problème de performance",
              },
              description:
                "Images reçues mais non affichées. Différent des pertes réseau.",
            }}
          />
          <StatItem
            icon={Network}
            label="Type candidat"
            value={connection?.localCandidateType || "-"}
            subValue={
              connection?.remoteCandidateType
                ? `→ ${connection.remoteCandidateType}`
                : undefined
            }
            tooltip={{
              title: "Type de candidat ICE",
              thresholds: {
                excellent: "host : Connexion directe",
                good: "srflx : Via serveur STUN",
                warning: "prflx : Peer reflexive",
                error: "relay : Via serveur TURN (lent)",
              },
              description:
                "Mode de connexion WebRTC. Direct est optimal, relay ajoute de la latence.",
            }}
          />
          <StatItem
            icon={Radio}
            label="Protocole"
            value={connection?.protocol?.toUpperCase() || "-"}
            tooltip={{
              title: "Protocole de transport",
              thresholds: {
                excellent: "UDP : Rapide, optimal pour vidéo",
                warning: "TCP : Plus lent, utilisé si UDP bloqué",
              },
              description: "UDP est préféré pour le streaming temps réel.",
            }}
          />
        </div>

        {/* Network Quality Section */}
        <div className="border-t pt-4">
          <h4 className="flex items-center gap-2 text-sm font-medium mb-3">
            <Signal className="h-4 w-4" />
            Qualité réseau
          </h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Network Speed Category */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-3 cursor-help">
                  <div
                    className={cn(
                      "rounded-lg p-2",
                      networkQuality
                        ? networkQuality.color === "text-emerald-500"
                          ? "bg-emerald-500/10"
                          : networkQuality.color === "text-amber-500"
                            ? "bg-amber-500/10"
                            : "bg-red-500/10"
                        : "bg-muted",
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
                      <p className="text-xs text-muted-foreground">
                        Vitesse réseau
                      </p>
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
                      <span className="text-emerald-500">■</span> Rapide : &gt;
                      4 Mbps (4G/LTE)
                    </p>
                    <p>
                      <span className="text-amber-500">■</span> Moyen : ~700
                      kbps (3G)
                    </p>
                    <p>
                      <span className="text-red-500">■</span> Lent : &lt; 100
                      kbps (2G)
                    </p>
                  </div>
                  {(networkInfo.downlink || networkInfo.rtt) && (
                    <div className="space-y-0.5 text-xs text-muted-foreground pt-1 border-t mt-1">
                      {networkInfo.downlink && (
                        <p>
                          Débit estimé : {networkInfo.downlink.toFixed(1)} Mbps
                        </p>
                      )}
                      {networkInfo.rtt && (
                        <p>
                          Latence estimée : {Math.round(networkInfo.rtt)} ms
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-muted-foreground pt-1">
                    Estimation du navigateur basée sur les conditions réseau
                    récentes.
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Bandwidth Usage */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-3 cursor-help">
                  <div
                    className={cn(
                      "rounded-lg p-2",
                      bandwidthUsagePercent > 90
                        ? "bg-red-500/10"
                        : bandwidthUsagePercent > 70
                          ? "bg-amber-500/10"
                          : bandwidthUsagePercent > 50
                            ? "bg-lime-500/10"
                            : "bg-emerald-500/10",
                    )}
                  >
                    <ArrowUpDown
                      className={cn("h-4 w-4", getBandwidthUsageColor())}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="text-xs text-muted-foreground">
                        Utilisation
                      </p>
                      <HelpCircle className="h-3 w-3 text-muted-foreground/50" />
                    </div>
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          "font-mono text-sm font-medium",
                          getBandwidthUsageColor(),
                        )}
                      >
                        {bandwidthUsagePercent.toFixed(0)}%
                      </p>
                      {availableBandwidth > 0 && (
                        <div className="flex-1 max-w-24">
                          <div className="h-1.5 w-full rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                bandwidthUsagePercent > 90
                                  ? "bg-red-500"
                                  : bandwidthUsagePercent > 70
                                    ? "bg-amber-500"
                                    : bandwidthUsagePercent > 50
                                      ? "bg-lime-500"
                                      : "bg-emerald-500",
                              )}
                              style={{ width: `${bandwidthUsagePercent}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Utilisation bande passante</p>
                  <div className="space-y-0.5 text-xs">
                    <p>
                      <span className="text-emerald-500">■</span> 0-50% :
                      Excellent
                    </p>
                    <p>
                      <span className="text-lime-500">■</span> 50-70% : Bon
                    </p>
                    <p>
                      <span className="text-amber-500">■</span> 70-90% : Limite
                    </p>
                    <p>
                      <span className="text-red-500">■</span> &gt;90% : Saturé
                    </p>
                  </div>
                  <p className="text-muted-foreground pt-1">
                    {formatBitrate(currentBitrate)} utilisé sur{" "}
                    {formatBitrate(availableBandwidth)} disponible.
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
