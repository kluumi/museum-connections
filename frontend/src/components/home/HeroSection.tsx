// HeroSection - Hero section with architecture diagram

import { ArrowLeftRight, MapPin, Users } from "lucide-react";

export function HeroSection() {
  return (
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
              <span className="text-xs text-muted-foreground">WebRTC P2P</span>
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
  );
}
