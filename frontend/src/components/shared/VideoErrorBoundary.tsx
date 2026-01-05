// VideoErrorBoundary - Specialized boundary for video element errors
// Pattern: Domain-specific error recovery with minimal UI

import { MonitorX, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";

interface Props {
  children: ReactNode;
  /** Compact mode for smaller containers (e.g., operator panels) */
  compact?: boolean;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary specialized for video element errors.
 * Used in receiver and operator video panels.
 * Supports compact mode for smaller containers.
 */
export class VideoErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("🎬 VideoErrorBoundary:", error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error } = this.state;
    const { compact } = this.props;
    const errorMessage = error ? getErrorMessage(error) : "Erreur vidéo";

    if (compact) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black/90 p-4 text-center text-white">
          <MonitorX className="h-6 w-6 text-red-400" />
          <p className="text-xs text-red-300">{errorMessage}</p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={this.handleRetry}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Réessayer
          </Button>
        </div>
      );
    }

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black/90 p-6 text-center text-white">
        <div className="rounded-full bg-red-500/20 p-3">
          <MonitorX className="h-8 w-8 text-red-400" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold">Erreur d'affichage vidéo</h3>
          <p className="text-sm text-gray-400">{errorMessage}</p>
        </div>
        <Button variant="outline" size="sm" onClick={this.handleRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Réessayer
        </Button>
      </div>
    );
  }
}
