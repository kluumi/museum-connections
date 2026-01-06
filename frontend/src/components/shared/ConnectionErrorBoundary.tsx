// ConnectionErrorBoundary - Specialized boundary for WebRTC/signaling errors
// Pattern: Domain-specific error recovery

import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { categorizeError, getErrorMessage } from "@/lib/errors";

interface Props {
  children: ReactNode;
  onReconnect?: () => void;
  onReload?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorType: "signaling" | "webrtc" | "network" | "unknown";
}

/**
 * Error boundary specialized for connection (WebRTC/signaling) errors.
 * Provides reconnection actions and network-specific hints.
 */
export class ConnectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorType: "unknown" };
  }

  static getDerivedStateFromError(error: Error): State {
    const errorType = getConnectionErrorType(error);
    return { hasError: true, error, errorType };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const category = categorizeError(error);
    console.error(
      `🔌 ConnectionErrorBoundary [${category}]:`,
      error,
      errorInfo,
    );
  }

  handleReconnect = (): void => {
    this.setState({ hasError: false, error: null, errorType: "unknown" });
    this.props.onReconnect?.();
  };

  handleReload = (): void => {
    this.props.onReload?.() ?? window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorType } = this.state;
    const errorMessage = error ? getErrorMessage(error) : "Erreur de connexion";

    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
        <div className="rounded-full bg-destructive/10 p-3">
          <WifiOff className="h-8 w-8 text-destructive" />
        </div>

        <div className="space-y-1">
          <h3 className="font-semibold text-lg">
            {getConnectionErrorTitle(errorType)}
          </h3>
          <p className="text-muted-foreground text-sm">{errorMessage}</p>
        </div>

        <div className="space-y-2 text-left text-sm text-muted-foreground">
          {getConnectionErrorHints(errorType).map((hint) => (
            <p key={hint}>• {hint}</p>
          ))}
        </div>

        <div className="flex gap-2">
          {this.props.onReconnect && (
            <Button variant="outline" size="sm" onClick={this.handleReconnect}>
              <Wifi className="mr-2 h-4 w-4" />
              Reconnecter
            </Button>
          )}
          <Button variant="default" size="sm" onClick={this.handleReload}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Recharger
          </Button>
        </div>
      </div>
    );
  }
}

function getConnectionErrorType(
  error: Error,
): "signaling" | "webrtc" | "network" | "unknown" {
  const msg = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (msg.includes("websocket") || msg.includes("signaling")) {
    return "signaling";
  }
  if (
    msg.includes("rtc") ||
    msg.includes("ice") ||
    msg.includes("sdp") ||
    msg.includes("peer")
  ) {
    return "webrtc";
  }
  if (
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("timeout") ||
    name.includes("network")
  ) {
    return "network";
  }
  return "unknown";
}

function getConnectionErrorTitle(
  type: "signaling" | "webrtc" | "network" | "unknown",
): string {
  switch (type) {
    case "signaling":
      return "Serveur déconnecté";
    case "webrtc":
      return "Connexion peer perdue";
    case "network":
      return "Réseau indisponible";
    default:
      return "Erreur de connexion";
  }
}

function getConnectionErrorHints(
  type: "signaling" | "webrtc" | "network" | "unknown",
): string[] {
  switch (type) {
    case "signaling":
      return [
        "Le serveur de signalisation est peut-être indisponible",
        "Vérifiez votre connexion internet",
        "Réessayez dans quelques instants",
      ];
    case "webrtc":
      return [
        "La connexion WebRTC a échoué",
        "Le pair distant s'est peut-être déconnecté",
        "Essayez de reconnecter ou recharger la page",
      ];
    case "network":
      return [
        "Vérifiez votre connexion internet",
        "Si vous êtes sur 5G, vérifiez le signal",
        "Essayez de changer de réseau",
      ];
    default:
      return [
        "Une erreur de connexion s'est produite",
        "Essayez de recharger la page",
      ];
  }
}
