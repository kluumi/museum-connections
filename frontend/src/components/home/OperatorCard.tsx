// OperatorCard - Card component for operator dashboard link

import { Link } from "@tanstack/react-router";
import { ChevronRight, LayoutDashboard } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function OperatorCard() {
  return (
    <Link to="/receivers/operator">
      <Card className="group cursor-pointer border-cyan-500/20 transition-all duration-300 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
              <LayoutDashboard className="h-6 w-6" />
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-cyan-500" />
          </div>
          <CardTitle className="text-xl transition-colors group-hover:text-cyan-500">
            Dashboard Opérateur
          </CardTitle>
          <CardDescription>
            Interface complète de monitoring avec vue simultanée des deux flux
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">Monitoring</p>
              <p className="text-xs text-muted-foreground">
                Visualisation temps réel des deux flux Nantes et Paris
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">Métriques</p>
              <p className="text-xs text-muted-foreground">
                Bitrate, FPS, latence, qualité de connexion
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">Contrôle</p>
              <p className="text-xs text-muted-foreground">
                Démarrage/arrêt à distance des diffusions
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
