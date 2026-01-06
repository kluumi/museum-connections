import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, Monitor, Video } from "lucide-react";
import {
  HeroSection,
  HomeFooter,
  HomeHeader,
  ObsReceiverCard,
  OperatorCard,
  SenderCard,
} from "@/components/home";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePageTitle } from "@/hooks";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  usePageTitle("Accueil");

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <HomeHeader />
        <HeroSection />

        {/* Main Content */}
        <main className="container mx-auto space-y-12 px-6 py-10">
          {/* Senders Section */}
          <section>
            <SectionHeader
              icon={<Video className="h-5 w-5 text-primary" />}
              title="Consoles de contrôle"
              description="Interfaces de diffusion pour les opérateurs sur site"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <SenderCard
                city="nantes"
                title="Nantes"
                description="Console de contrôle pour la personne filmée en mode surveillance"
                href="/senders/nantes"
                features={[
                  "Sélection caméra et microphone",
                  "Réglages résolution, FPS, bitrate",
                  "Diffuse vers Paris (grand écran)",
                ]}
              />
              <SenderCard
                city="paris"
                title="Paris"
                description="Console de contrôle pour filmer le public de l'événement"
                href="/senders/paris"
                features={[
                  "Sélection caméra et microphone",
                  "Réglages résolution, FPS, bitrate",
                  "Diffuse vers Nantes (moniteur)",
                ]}
              />
            </div>
          </section>

          {/* OBS Receivers Section */}
          <section>
            <SectionHeader
              icon={<Monitor className="h-5 w-5 text-slate-400" />}
              title="Récepteurs OBS"
              description="Pages plein écran optimisées pour les sources navigateur OBS"
            />

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
            <SectionHeader
              icon={<LayoutDashboard className="h-5 w-5 text-cyan-500" />}
              title="Régie opérateur"
              description="Surveillance centralisée et contrôle à distance"
            />

            <OperatorCard />
          </section>
        </main>

        <HomeFooter />
      </div>
    </TooltipProvider>
  );
}

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function SectionHeader({ icon, title, description }: SectionHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
