// French UI messages (all text in French for broadcast operators)

export const MESSAGES = {
  errors: {
    generic: "Une erreur est survenue",
    networkLost: "Connexion réseau perdue",
    streamFailed: "Impossible de démarrer le flux",
    signalingFailed: "Connexion au serveur échouée",
    mediaAccessDenied: "Accès à la caméra/microphone refusé",
    peerConnectionFailed: "Connexion WebRTC échouée",
    noDevicesFound: "Aucun périphérique trouvé",
  },

  status: {
    connected: "Connecté",
    connecting: "Connexion en cours...",
    reconnecting: "Reconnexion...",
    disconnected: "Déconnecté",
    failed: "Échec",
  },

  signaling: {
    connected: "SERVEUR CONNECTÉ",
    disconnected: "SERVEUR DÉCONNECTÉ",
    reconnecting: "RECONNEXION...",
  },

  stream: {
    idle: "En attente",
    starting: "Démarrage...",
    streaming: "En direct",
    stopped: "Arrêté",
    stoppedManual: "ARRÊTÉ PAR L'UTILISATEUR",
    stoppedPageClosed: "PAGE FERMÉE",
    stoppedNetworkLost: "RÉSEAU PERDU",
    waitingForStream: "En attente du flux...",
  },

  controls: {
    start: "Démarrer",
    stop: "Arrêter",
    reconnect: "Reconnecter",
    selectCamera: "Sélectionner caméra",
    selectMicrophone: "Sélectionner microphone",
    videoSettings: "Paramètres vidéo",
  },

  settings: {
    mode: "Mode",
    modeManual: "Manuel",
    modeAuto: "Full Auto",
    resolution: "Résolution",
    fps: "Images/sec",
    bitrate: "Débit",
    codec: "Codec",
    auto: "Auto",
  },

  quality: {
    excellent: "EXCELLENT",
    good: "BON",
    fair: "CORRECT",
    poor: "MAUVAIS",
  },

  metrics: {
    bitrate: "Débit",
    fps: "FPS",
    resolution: "Résolution",
    rtt: "Latence",
    packetLoss: "Perte paquets",
    jitter: "Gigue",
  },

  operator: {
    title: "Tableau de bord opérateur",
    nantesFeed: "Flux Nantes",
    parisFeed: "Flux Paris",
    obsNantes: "OBS Nantes",
    obsParis: "OBS Paris",
  },
} as const;

// Quality thresholds matching legacy metrics.js
export const QUALITY_THRESHOLDS = {
  EXCELLENT: 80,
  GOOD: 60,
  FAIR: 40,
} as const;

export function getQualityLabel(score: number): keyof typeof MESSAGES.quality {
  if (score >= QUALITY_THRESHOLDS.EXCELLENT) return "excellent";
  if (score >= QUALITY_THRESHOLDS.GOOD) return "good";
  if (score >= QUALITY_THRESHOLDS.FAIR) return "fair";
  return "poor";
}

export function getQualityColor(score: number): string {
  if (score >= QUALITY_THRESHOLDS.EXCELLENT) return "green";
  if (score >= QUALITY_THRESHOLDS.GOOD) return "lime";
  if (score >= QUALITY_THRESHOLDS.FAIR) return "orange";
  return "red";
}
