import type { ErrorComponentProps } from "@tanstack/react-router";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { ThemeProvider } from "@/components/theme";
import { useMetricsSync } from "@/hooks/useMetricsSync";

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-router-devtools").then((mod) => ({
        default: mod.TanStackRouterDevtools,
      })),
    )
  : () => null;

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RootErrorBoundary,
});

function RootLayout() {
  // Sync metrics events from WebRTCService to Zustand store
  useMetricsSync();

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background text-foreground">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
        <Suspense>
          <TanStackRouterDevtools position="bottom-right" />
        </Suspense>
      </div>
    </ThemeProvider>
  );
}

function RootErrorBoundary({ error }: ErrorComponentProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold text-destructive">
        Une erreur est survenue
      </h1>
      <p className="text-muted-foreground">
        {error instanceof Error ? error.message : "Erreur inconnue"}
      </p>
      <a
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
      >
        Retour à l'accueil
      </a>
    </div>
  );
}
