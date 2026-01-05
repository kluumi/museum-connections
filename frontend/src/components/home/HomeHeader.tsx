// HomeHeader - Header component for the home page

import { Radio } from "lucide-react";
import { ThemeToggle } from "@/components/theme";

export function HomeHeader() {
  return (
    <header className="border-b bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
            <Radio className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">WebRTC Live</h1>
            <p className="text-sm text-muted-foreground">
              Streaming bidirectionnel en temps réel
            </p>
          </div>
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
}
