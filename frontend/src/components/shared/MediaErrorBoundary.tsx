// MediaErrorBoundary - Specialized boundary for camera/microphone errors
// Pattern: Domain-specific error recovery

import { Camera, Mic, RefreshCw, Settings } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { categorizeError, getErrorMessage } from "@/lib/errors";

interface Props {
  children: ReactNode;
  onRetry?: () => void;
  onOpenSettings?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorType: "permission" | "device" | "constraint" | "unknown";
}

/**
 * Error boundary specialized for media (camera/microphone) errors.
 * Provides context-aware recovery actions.
 */
export class MediaErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorType: "unknown" };
  }

  static getDerivedStateFromError(error: Error): State {
    const errorType = getMediaErrorType(error);
    return { hasError: true, error, errorType };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const category = categorizeError(error);
    console.error(`📷 MediaErrorBoundary [${category}]:`, error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorType: "unknown" });
    this.props.onRetry?.();
  };

  handleOpenSettings = (): void => {
    this.props.onOpenSettings?.();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorType } = this.state;
    const errorMessage = error ? getErrorMessage(error) : "Erreur média";

    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
        <div className="flex gap-2">
          <div className="rounded-full bg-destructive/10 p-2">
            <Camera className="h-5 w-5 text-destructive" />
          </div>
          <div className="rounded-full bg-destructive/10 p-2">
            <Mic className="h-5 w-5 text-destructive" />
          </div>
        </div>

        <div className="space-y-1">
          <h3 className="font-semibold text-lg">
            {getMediaErrorTitle(errorType)}
          </h3>
          <p className="text-muted-foreground text-sm">{errorMessage}</p>
        </div>

        <div className="space-y-2 text-left text-sm text-muted-foreground">
          {getMediaErrorHints(errorType).map((hint) => (
            <p key={hint}>• {hint}</p>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={this.handleRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Réessayer
          </Button>
          {this.props.onOpenSettings && (
            <Button
              variant="default"
              size="sm"
              onClick={this.handleOpenSettings}
            >
              <Settings className="mr-2 h-4 w-4" />
              Paramètres
            </Button>
          )}
        </div>
      </div>
    );
  }
}

function getMediaErrorType(
  error: Error,
): "permission" | "device" | "constraint" | "unknown" {
  const name = error.name.toLowerCase();

  if (name.includes("notallowed") || name.includes("security")) {
    return "permission";
  }
  if (name.includes("notfound") || name.includes("notreadable")) {
    return "device";
  }
  if (name.includes("overconstrained")) {
    return "constraint";
  }
  return "unknown";
}

function getMediaErrorTitle(
  type: "permission" | "device" | "constraint" | "unknown",
): string {
  switch (type) {
    case "permission":
      return "Accès refusé";
    case "device":
      return "Périphérique indisponible";
    case "constraint":
      return "Format non supporté";
    default:
      return "Erreur média";
  }
}

function getMediaErrorHints(
  type: "permission" | "device" | "constraint" | "unknown",
): string[] {
  switch (type) {
    case "permission":
      return [
        "Vérifiez les permissions du navigateur",
        "Cliquez sur l'icône caméra dans la barre d'adresse",
        "Autorisez l'accès puis réessayez",
      ];
    case "device":
      return [
        "Vérifiez que la caméra est branchée",
        "Fermez les autres applications utilisant la caméra",
        "Essayez un autre périphérique",
      ];
    case "constraint":
      return [
        "La résolution demandée n'est pas supportée",
        "Essayez une résolution plus basse",
        "Vérifiez les capacités de votre caméra",
      ];
    default:
      return [
        "Une erreur inattendue s'est produite",
        "Essayez de recharger la page",
      ];
  }
}
