// OperatorSettingsSheet - Settings sheet for operator dashboard
// Pattern: Extracted from operator.tsx to reduce monolith

import { Activity, LayoutGrid } from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import {
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { NodeId } from "@/constants/node-ids";

export interface OperatorSettings {
  showDetailedStats: boolean;
  stackedLayout: boolean;
}

export interface ConnectionInfo {
  isSignalingConnected: boolean;
  connectedPeers: NodeId[];
  nantesConnected: boolean;
  parisConnected: boolean;
}

export interface OperatorSettingsSheetProps {
  settings: OperatorSettings;
  onSettingsChange: (settings: Partial<OperatorSettings>) => void;
  connectionInfo: ConnectionInfo;
}

export function OperatorSettingsSheet({
  settings,
  onSettingsChange,
  connectionInfo,
}: OperatorSettingsSheetProps) {
  const {
    isSignalingConnected,
    connectedPeers,
    nantesConnected,
    parisConnected,
  } = connectionInfo;

  return (
    <SheetContent side="right" className="p-0 flex flex-col">
      <SheetHeader className="p-4 shrink-0 border-b">
        <SheetTitle className="text-lg">Paramètres</SheetTitle>
        <p className="text-xs text-muted-foreground">
          Affichage et préférences
        </p>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto">
        <Accordion
          type="multiple"
          defaultValue={["display"]}
          className="w-full"
        >
          {/* Display Settings */}
          <AccordionItem value="display" className="border-0 px-4">
            <AccordionTrigger className="hover:no-underline py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <LayoutGrid className="h-4 w-4" />
                Affichage
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="detailed-stats" className="text-sm">
                    Stats détaillées
                  </Label>
                  <Switch
                    id="detailed-stats"
                    checked={settings.showDetailedStats}
                    onCheckedChange={(checked) =>
                      onSettingsChange({ showDetailedStats: checked })
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Affiche le panneau de statistiques complet sous chaque flux
                  vidéo.
                </p>

                <div className="flex items-center justify-between">
                  <Label htmlFor="stacked-layout" className="text-sm">
                    Vue empilée
                  </Label>
                  <Switch
                    id="stacked-layout"
                    checked={settings.stackedLayout}
                    onCheckedChange={(checked) =>
                      onSettingsChange({ stackedLayout: checked })
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Affiche les flux l'un au-dessus de l'autre au lieu de côte à
                  côte.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Connection Info */}
          <AccordionItem value="connection" className="border-0 px-4">
            <AccordionTrigger className="hover:no-underline py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4" />
                Connexions
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Signalisation</span>
                  <span
                    className={
                      isSignalingConnected
                        ? "text-emerald-500"
                        : "text-destructive"
                    }
                  >
                    {isSignalingConnected ? "Connecté" : "Déconnecté"}
                  </span>
                </div>

                {/* Nantes Section */}
                <div className="space-y-1.5 pt-2 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Nantes</span>
                    <span
                      className={
                        nantesConnected
                          ? "text-emerald-500"
                          : "text-muted-foreground"
                      }
                    >
                      {nantesConnected ? "En direct" : "Hors ligne"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm pl-5">
                    <span className="text-muted-foreground text-xs">
                      Récepteur
                    </span>
                    <span
                      className={
                        connectedPeers.includes(NodeId.OBS_NANTES)
                          ? "text-emerald-500 text-xs"
                          : "text-muted-foreground text-xs"
                      }
                    >
                      {connectedPeers.includes(NodeId.OBS_NANTES)
                        ? "Connecté"
                        : "Hors ligne"}
                    </span>
                  </div>
                </div>

                {/* Paris Section */}
                <div className="space-y-1.5 pt-2 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Paris</span>
                    <span
                      className={
                        parisConnected
                          ? "text-emerald-500"
                          : "text-muted-foreground"
                      }
                    >
                      {parisConnected ? "En direct" : "Hors ligne"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm pl-5">
                    <span className="text-muted-foreground text-xs">
                      Récepteur
                    </span>
                    <span
                      className={
                        connectedPeers.includes(NodeId.OBS_PARIS)
                          ? "text-emerald-500 text-xs"
                          : "text-muted-foreground text-xs"
                      }
                    >
                      {connectedPeers.includes(NodeId.OBS_PARIS)
                        ? "Connecté"
                        : "Hors ligne"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm pt-2 border-t">
                  <span className="text-muted-foreground">Pairs connectés</span>
                  <span className="font-mono">{connectedPeers.length}</span>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Footer */}
      <SheetFooter className="shrink-0 border-t p-4">
        <div className="flex w-full items-center justify-between">
          <ThemeToggle />
          <span className="text-xs text-muted-foreground">Régie v2.0</span>
        </div>
      </SheetFooter>
    </SheetContent>
  );
}

// LocalStorage persistence helpers
const OPERATOR_SETTINGS_KEY = "operator-dashboard-settings";

export function loadOperatorSettings(): OperatorSettings {
  try {
    const stored = localStorage.getItem(OPERATOR_SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored) as OperatorSettings;
    }
  } catch {
    // Ignore parse errors
  }
  return { showDetailedStats: true, stackedLayout: false };
}

export function saveOperatorSettings(settings: OperatorSettings): void {
  localStorage.setItem(OPERATOR_SETTINGS_KEY, JSON.stringify(settings));
}
