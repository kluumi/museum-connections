// Metrics constants and quality scoring utilities
// Centralizes all quality thresholds, labels, colors, and tooltip content

/** Quality level based on score */
export type QualityLevel = "excellent" | "good" | "fair" | "poor" | "none";

/** Quality thresholds (score 0-100) */
export const QUALITY_THRESHOLDS = {
  EXCELLENT: 80,
  GOOD: 60,
  FAIR: 40,
} as const;

/** Quality labels in French */
export const QUALITY_LABELS: Record<QualityLevel, string> = {
  excellent: "Excellent",
  good: "Bon",
  fair: "Moyen",
  poor: "Faible",
  none: "Pas de signal",
} as const;

/** Quality labels in uppercase (for badges) */
export const QUALITY_LABELS_UPPERCASE: Record<QualityLevel, string> = {
  excellent: "EXCELLENT",
  good: "BON",
  fair: "MOYEN",
  poor: "MAUVAIS",
  none: "N/A",
} as const;

/** Tailwind text colors for quality levels */
export const QUALITY_TEXT_COLORS: Record<QualityLevel, string> = {
  excellent: "text-emerald-500",
  good: "text-lime-500",
  fair: "text-amber-500",
  poor: "text-red-500",
  none: "text-muted-foreground",
} as const;

/** Tailwind background colors for progress bars */
export const QUALITY_PROGRESS_COLORS: Record<QualityLevel, string> = {
  excellent: "[&>div]:bg-emerald-500",
  good: "[&>div]:bg-lime-500",
  fair: "[&>div]:bg-amber-500",
  poor: "[&>div]:bg-red-500",
  none: "[&>div]:bg-muted-foreground",
} as const;

/** CSS variable-based colors for badges */
export const QUALITY_BADGE_CLASSES: Record<QualityLevel, string> = {
  excellent: "bg-[var(--status-online)] text-black",
  good: "bg-lime-400 text-black",
  fair: "bg-[var(--status-pending)] text-black",
  poor: "bg-[var(--status-offline)] text-white",
  none: "bg-muted text-muted-foreground",
} as const;

/** Simple color names (for legacy compatibility) */
export const QUALITY_COLORS: Record<QualityLevel, string> = {
  excellent: "green",
  good: "lime",
  fair: "orange",
  poor: "red",
  none: "gray",
} as const;

/**
 * Get quality level from score
 */
export function getQualityLevel(score: number): QualityLevel {
  if (score <= 0) return "none";
  if (score >= QUALITY_THRESHOLDS.EXCELLENT) return "excellent";
  if (score >= QUALITY_THRESHOLDS.GOOD) return "good";
  if (score >= QUALITY_THRESHOLDS.FAIR) return "fair";
  return "poor";
}

/**
 * Get quality style object (label, textColor, progressColor)
 */
export function getQualityStyle(score: number): {
  level: QualityLevel;
  label: string;
  color: string;
  progress: string;
} {
  const level = getQualityLevel(score);
  return {
    level,
    label: QUALITY_LABELS[level],
    color: QUALITY_TEXT_COLORS[level],
    progress: QUALITY_PROGRESS_COLORS[level],
  };
}

/** Metric tooltip descriptions in French */
export const METRIC_TOOLTIPS = {
  qualityScore: {
    title: "Score de qualité",
    description:
      "Basé sur la latence, pertes, FPS, jitter, bitrate, résolution, bande passante et images perdues.",
    ranges: [
      { label: "80-100 : Excellent", color: "text-emerald-500" },
      { label: "60-79 : Bon", color: "text-lime-500" },
      { label: "40-59 : Moyen", color: "text-amber-500" },
      { label: "0-39 : Faible", color: "text-red-500" },
    ],
  },
  rtt: {
    title: "Latence (RTT)",
    description: "Temps d'aller-retour du signal entre les deux points.",
    unit: "ms",
    thresholds: { good: "< 150ms", warn: "150-300ms", bad: "> 300ms" },
  },
  packetLoss: {
    title: "Perte de paquets",
    description: "Pourcentage de paquets perdus pendant la transmission.",
    unit: "%",
    thresholds: { good: "< 2%", warn: "2-5%", bad: "> 5%" },
  },
  fps: {
    title: "Images par seconde",
    description: "Nombre d'images vidéo transmises par seconde.",
    unit: "fps",
    thresholds: { good: "> 24 fps", warn: "15-24 fps", bad: "< 15 fps" },
  },
  jitter: {
    title: "Gigue",
    description: "Variation du délai entre les paquets reçus.",
    unit: "ms",
    thresholds: { good: "< 20ms", warn: "20-50ms", bad: "> 50ms" },
  },
  bitrate: {
    title: "Débit vidéo",
    description: "Quantité de données transmises par seconde.",
    unit: "kbps",
    thresholds: { good: "> 2 Mbps", warn: "1-2 Mbps", bad: "< 1 Mbps" },
  },
  resolution: {
    title: "Résolution",
    description: "Dimensions de l'image vidéo en pixels.",
    thresholds: { good: "1080p+", warn: "720p", bad: "< 720p" },
  },
  bandwidth: {
    title: "Bande passante disponible",
    description: "Capacité réseau estimée pour la transmission.",
    unit: "kbps",
    thresholds: { good: "> 3 Mbps", warn: "2-3 Mbps", bad: "< 2 Mbps" },
  },
  framesDropped: {
    title: "Images perdues",
    description: "Nombre d'images vidéo non affichées.",
    thresholds: { good: "< 10", warn: "10-50", bad: "> 50" },
  },
} as const;

/** Format bitrate for display */
export function formatBitrate(kbps: number): string {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  if (kbps >= 1) return `${Math.round(kbps)} kbps`;
  return `${kbps.toFixed(1)} kbps`;
}

/** Format resolution for display */
export function formatResolution(width: number, height: number): string {
  if (!width || !height) return "-";
  return `${width}×${height}`;
}

/** Format RTT for display */
export function formatRtt(ms: number): string {
  if (!ms) return "-";
  return `${Math.round(ms)} ms`;
}

/** Format packet loss for display */
export function formatPacketLoss(percent: number): string {
  if (percent === undefined || percent === null) return "-";
  return `${percent.toFixed(1)}%`;
}

/** Format FPS for display */
export function formatFps(fps: number): string {
  if (!fps) return "-";
  return `${Math.round(fps)} fps`;
}
