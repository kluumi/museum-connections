import {
  AlertTriangle,
  ArrowUpDown,
  Gauge,
  ImageOff,
  MonitorPlay,
  Network,
  Radio,
  Timer,
  Waves,
} from "lucide-react";
import { StatItem, type TooltipInfo, type WarningSeverity } from "./StatItem";

// Helper function
function formatBitrate(kbps: number): string {
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  if (kbps >= 1) {
    return `${Math.round(kbps)} kbps`;
  }
  return `${kbps.toFixed(1)} kbps`;
}

function getSeverity(
  value: number | undefined,
  thresholds: { warning: number; error: number },
  higher = true,
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

// Tooltip configurations
const TOOLTIPS: Record<string, TooltipInfo> = {
  rtt: {
    title: "Latence (Round-Trip Time)",
    thresholds: {
      excellent: "< 50 ms : Excellent",
      good: "50-150 ms : Bon",
      warning: "150-300 ms : Moyen",
      error: "> 300 ms : Problématique",
    },
    description:
      "Temps aller-retour des paquets entre vous et le destinataire.",
  },
  bitrate: {
    title: "Bitrate vidéo",
    thresholds: {
      excellent: "> 3 Mbps : Excellent (1080p)",
      good: "1-3 Mbps : Bon (720p)",
      warning: "0.5-1 Mbps : Moyen (480p)",
      error: "< 500 kbps : Faible",
    },
    description:
      "Débit de données vidéo envoyées. Plus élevé = meilleure qualité.",
  },
  bandwidth: {
    title: "Bande passante disponible",
    thresholds: {
      excellent: "> 5 Mbps : Excellent",
      good: "2-5 Mbps : Bon",
      warning: "1-2 Mbps : Limite",
      error: "< 1 Mbps : Insuffisant",
    },
    description: "Capacité réseau estimée. Doit être supérieure au bitrate.",
  },
  fps: {
    title: "Framerate (FPS)",
    thresholds: {
      excellent: "> 30 fps : Très fluide",
      good: "24-30 fps : Fluide",
      warning: "15-24 fps : Saccades légères",
      error: "< 15 fps : Saccades visibles",
    },
    description: "Nombre d'images par seconde du flux vidéo.",
  },
  packetLoss: {
    title: "Perte de paquets",
    thresholds: {
      excellent: "< 1% : Excellent",
      good: "1-2% : Acceptable",
      warning: "2-5% : Dégradation visible",
      error: "> 5% : Artefacts, freezes",
    },
    description: "Paquets réseau perdus en transit. Affecte la qualité vidéo.",
  },
  jitter: {
    title: "Jitter (Gigue)",
    thresholds: {
      excellent: "< 10 ms : Très stable",
      good: "10-20 ms : Stable",
      warning: "20-50 ms : Instable",
      error: "> 50 ms : Très instable",
    },
    description: "Variation du délai entre paquets. Peut causer des saccades.",
  },
  resolution: {
    title: "Résolution vidéo",
    thresholds: {
      excellent: "1080p (1920×1080) : Full HD",
      good: "720p (1280×720) : HD",
      warning: "480p (854×480) : SD",
      error: "< 480p : Basse qualité",
    },
    description:
      "Dimensions de l'image. VP9/H264 offrent meilleure compression.",
  },
  framesDropped: {
    title: "Images perdues (Frames dropped)",
    thresholds: {
      excellent: "0 : Parfait",
      good: "1-10 : Acceptable",
      warning: "10-50 : CPU/GPU surchargé",
      error: "> 50 : Problème de performance",
    },
    description:
      "Images reçues mais non affichées. Différent des pertes réseau.",
  },
  candidateType: {
    title: "Type de candidat ICE",
    thresholds: {
      excellent: "host : Connexion directe",
      good: "srflx : Via serveur STUN",
      warning: "prflx : Peer reflexive",
      error: "relay : Via serveur TURN (lent)",
    },
    description:
      "Mode de connexion WebRTC. Direct est optimal, relay ajoute de la latence.",
  },
  protocol: {
    title: "Protocole de transport",
    thresholds: {
      excellent: "UDP : Rapide, optimal pour vidéo",
      warning: "TCP : Plus lent, utilisé si UDP bloqué",
    },
    description: "UDP est préféré pour le streaming temps réel.",
  },
};

interface VideoMetrics {
  bitrate?: number;
  fps?: number;
  width?: number;
  height?: number;
  codec?: string;
  packetLoss?: number;
  jitter?: number;
  framesDropped?: number;
}

interface ConnectionMetrics {
  rtt?: number;
  localCandidateType?: string;
  remoteCandidateType?: string;
  protocol?: string;
  availableOutgoingBitrate?: number;
  availableIncomingBitrate?: number;
}

interface StatsGridProps {
  video?: VideoMetrics;
  connection?: ConnectionMetrics;
  hideBandwidth?: boolean;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Grid of stats items with severity calculations
export function StatsGrid({
  video,
  connection,
  hideBandwidth = false,
}: StatsGridProps) {
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

  const availableBandwidth =
    connection?.availableOutgoingBitrate ||
    connection?.availableIncomingBitrate ||
    0;
  const bandwidthSeverity = getSeverity(
    availableBandwidth,
    { warning: 2000, error: 1000 },
    false,
  );

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <StatItem
        icon={Timer}
        label="Latence (RTT)"
        value={connection?.rtt ? `${connection.rtt.toFixed(0)} ms` : "-"}
        severity={rttSeverity}
        tooltip={TOOLTIPS.rtt}
      />
      <StatItem
        icon={Gauge}
        label="Bitrate"
        value={
          video?.bitrate
            ? formatBitrate(video.bitrate)
            : video?.fps || video?.width
              ? "Calcul..."
              : "-"
        }
        severity={bitrateSeverity}
        tooltip={TOOLTIPS.bitrate}
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
          tooltip={TOOLTIPS.bandwidth}
        />
      )}
      <StatItem
        icon={MonitorPlay}
        label="Framerate"
        value={video?.fps ? `${Math.round(video.fps)} fps` : "-"}
        severity={fpsSeverity}
        tooltip={TOOLTIPS.fps}
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
        tooltip={TOOLTIPS.packetLoss}
      />
      <StatItem
        icon={Waves}
        label="Jitter"
        value={
          video?.jitter !== undefined ? `${video.jitter.toFixed(1)} ms` : "-"
        }
        severity={jitterSeverity}
        tooltip={TOOLTIPS.jitter}
      />
      <StatItem
        icon={MonitorPlay}
        label="Résolution"
        value={
          video?.width && video?.height ? `${video.width}x${video.height}` : "-"
        }
        subValue={video?.codec ? `(${video.codec})` : undefined}
        severity={resolutionSeverity}
        tooltip={TOOLTIPS.resolution}
      />
      <StatItem
        icon={ImageOff}
        label="Images perdues"
        value={
          video?.framesDropped !== undefined
            ? video.framesDropped.toString()
            : "-"
        }
        severity={getSeverity(video?.framesDropped, { warning: 10, error: 50 })}
        tooltip={TOOLTIPS.framesDropped}
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
        tooltip={TOOLTIPS.candidateType}
      />
      <StatItem
        icon={Radio}
        label="Protocole"
        value={connection?.protocol?.toUpperCase() || "-"}
        tooltip={TOOLTIPS.protocol}
      />
    </div>
  );
}
