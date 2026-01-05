// OperatorHeader - Header component for operator dashboard
// Pattern: Extracted from operator.tsx to reduce monolith

import { Eye, SlidersHorizontal } from "lucide-react";
import { SignalingBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { SheetTrigger } from "@/components/ui/sheet";

export interface OperatorHeaderProps {
  isSignalingConnected: boolean;
}

export function OperatorHeader({ isSignalingConnected }: OperatorHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
              <Eye className="h-5 w-5 text-cyan-500" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-cyan-500">
                Régie Opérateur
              </h1>
              <p className="text-xs text-muted-foreground">
                Monitoring multi-sources
              </p>
            </div>
          </div>

          {/* Center: Connection Status Badge */}
          <div className="hidden md:flex items-center gap-2">
            <SignalingBadge connected={isSignalingConnected} />
          </div>

          {/* Right: Settings Button (SheetTrigger) */}
          <div className="flex items-center gap-2">
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <SlidersHorizontal className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </div>
        </div>
      </div>
    </header>
  );
}
