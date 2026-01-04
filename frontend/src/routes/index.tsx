import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  LayoutDashboard,
  MapPin,
  Monitor,
  Radio,
  Users,
  Video,
} from "lucide-react";
import { useCallback, useState } from "react";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto flex items-center justify-between px-6 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
                <Radio className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  WebRTC Live
                </h1>
                <p className="text-sm text-muted-foreground">
                  Streaming bidirectionnel en temps réel
                </p>
              </div>
            </div>

            <ThemeToggle />
          </div>
        </header>

        {/* Hero Section */}
        <section className="border-b bg-gradient-to-b from-card/50 to-transparent">
          <div className="container mx-auto px-6 py-12">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm">
                <div className="flex h-2 w-2 animate-pulse rounded-full bg-green-500" />
                <span className="text-muted-foreground">
                  Installation interactive
                </span>
              </div>
              <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Connexion{" "}
                <span className="bg-gradient-to-r from-[var(--nantes)] to-[var(--paris)] bg-clip-text text-transparent">
                  Nantes — Paris
                </span>
              </h2>
              <p className="text-lg text-muted-foreground">
                Système de streaming vidéo bidirectionnel pour une expérience
                immersive reliant deux lieux en temps réel.
              </p>
            </div>

            {/* Architecture Diagram */}
            <div className="mx-auto mt-10 max-w-2xl">
              <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--nantes)]/10 text-[var(--nantes)]">
                    <MapPin className="h-8 w-8" />
                  </div>
                  <span className="text-sm font-medium">Nantes</span>
                  <span className="text-xs text-muted-foreground">
                    Personne filmée
                  </span>
                </div>

                <div className="flex flex-1 flex-col items-center gap-1">
                  <ArrowLeftRight className="h-6 w-6 text-muted-foreground" />
                  <div className="h-px w-full bg-gradient-to-r from-[var(--nantes)]/50 via-muted-foreground/30 to-[var(--paris)]/50" />
                  <span className="text-xs text-muted-foreground">
                    WebRTC P2P
                  </span>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--paris)]/10 text-[var(--paris)]">
                    <Users className="h-8 w-8" />
                  </div>
                  <span className="text-sm font-medium">Paris</span>
                  <span className="text-xs text-muted-foreground">
                    Public & grand écran
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Main Content */}
        <main className="container mx-auto space-y-12 px-6 py-10">
          {/* Émetteurs Section */}
          <section>
            <div className="mb-6">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Consoles de contrôle</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Interfaces de diffusion pour les opérateurs sur site
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Nantes Card */}
              <Link to="/senders/nantes">
                <Card className="group h-full cursor-pointer border-[var(--nantes)]/20 transition-all duration-300 hover:border-[var(--nantes)]/50 hover:shadow-lg hover:shadow-[var(--nantes)]/10">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--nantes)]/10 text-[var(--nantes)]">
                        <Video className="h-6 w-6" />
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-[var(--nantes)]" />
                    </div>
                    <CardTitle className="text-xl transition-colors group-hover:text-[var(--nantes)]">
                      Nantes
                    </CardTitle>
                    <CardDescription>
                      Console de contrôle pour la personne filmée en mode
                      surveillance
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-[var(--nantes)]" />
                        Sélection caméra et microphone
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-[var(--nantes)]" />
                        Réglages résolution, FPS, bitrate
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-[var(--nantes)]" />
                        Diffuse vers Paris (grand écran)
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </Link>

              {/* Paris Card */}
              <Link to="/senders/paris">
                <Card className="group h-full cursor-pointer border-[var(--paris)]/20 transition-all duration-300 hover:border-[var(--paris)]/50 hover:shadow-lg hover:shadow-[var(--paris)]/10">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--paris)]/10 text-[var(--paris)]">
                        <Video className="h-6 w-6" />
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-[var(--paris)]" />
                    </div>
                    <CardTitle className="text-xl transition-colors group-hover:text-[var(--paris)]">
                      Paris
                    </CardTitle>
                    <CardDescription>
                      Console de contrôle pour filmer le public de l'événement
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-[var(--paris)]" />
                        Sélection caméra et microphone
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-[var(--paris)]" />
                        Réglages résolution, FPS, bitrate
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-[var(--paris)]" />
                        Diffuse vers Nantes (moniteur)
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </section>

          {/* OBS Receivers Section */}
          <section>
            <div className="mb-6">
              <div className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-slate-400" />
                <h3 className="text-lg font-semibold">Récepteurs OBS</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Pages plein écran optimisées pour les sources navigateur OBS
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ObsReceiverCard
                title="OBS Nantes"
                description="Affiche le flux vidéo de Paris sur le moniteur de Nantes"
                href="/receivers/obs-nantes"
                color="paris"
                details={[
                  "Reçoit le flux de Paris",
                  "Écran de la personne filmée",
                  "Plein écran automatique",
                ]}
              />
              <ObsReceiverCard
                title="OBS Paris"
                description="Affiche le flux vidéo de Nantes sur le grand écran de Paris"
                href="/receivers/obs-paris"
                color="nantes"
                details={[
                  "Reçoit le flux de Nantes",
                  "Grand écran public",
                  "Plein écran automatique",
                ]}
              />
            </div>
          </section>

          {/* Operator Section */}
          <section>
            <div className="mb-6">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5 text-cyan-500" />
                <h3 className="text-lg font-semibold">Régie opérateur</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Surveillance centralisée et contrôle à distance
              </p>
            </div>

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
                    Interface complète de monitoring avec vue simultanée des
                    deux flux
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
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t bg-card/30">
          <div className="container mx-auto px-6 py-6">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <p className="text-sm text-muted-foreground">
                Installation interactive Nantes — Paris
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>WebRTC P2P</span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                <span>React + TypeScript</span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                <span>TailwindCSS</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}

interface ObsReceiverCardProps {
  title: string;
  description: string;
  href: string;
  color: "nantes" | "paris";
  details: string[];
}

function ObsReceiverCard({
  title,
  description,
  href,
  color,
  details,
}: ObsReceiverCardProps) {
  const [copied, setCopied] = useState(false);

  // Build the full URL for OBS
  const fullUrl =
    typeof window !== "undefined" ? `${window.location.origin}${href}` : href;

  const handleCopyUrl = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [fullUrl],
  );

  const colorStyles = {
    nantes: {
      bg: "bg-[var(--nantes)]/10",
      text: "text-[var(--nantes)]",
      dot: "bg-[var(--nantes)]",
      border: "border-slate-500/20 hover:border-slate-500/50",
      shadow: "hover:shadow-slate-500/10",
    },
    paris: {
      bg: "bg-[var(--paris)]/10",
      text: "text-[var(--paris)]",
      dot: "bg-[var(--paris)]",
      border: "border-slate-500/20 hover:border-slate-500/50",
      shadow: "hover:shadow-slate-500/10",
    },
  };

  const styles = colorStyles[color];

  return (
    <Card
      className={cn(
        "group h-full transition-all duration-300 hover:shadow-lg",
        styles.border,
        styles.shadow,
      )}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl",
              styles.bg,
              styles.text,
            )}
          >
            <Monitor className="h-6 w-6" />
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={handleCopyUrl}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {copied ? "URL copiée !" : "Copier l'URL pour OBS"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to={href}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent>Ouvrir dans un nouvel onglet</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm text-muted-foreground">
          {details.map((detail, i) => (
            <li key={i} className="flex items-center gap-2">
              <div className={cn("h-1.5 w-1.5 rounded-full", styles.dot)} />
              {detail}
            </li>
          ))}
        </ul>

        {/* URL Display */}
        <div className="rounded-lg border bg-muted/50 p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            URL pour OBS Browser Source
          </p>
          <code className="block truncate text-xs text-foreground">
            {fullUrl}
          </code>
        </div>
      </CardContent>
    </Card>
  );
}
