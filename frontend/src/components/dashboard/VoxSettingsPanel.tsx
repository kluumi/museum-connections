// VoxSettingsPanel - VOX Ducking configuration UI
// Pattern: Settings panel component for VOX (Voice-Operated Switch) parameters

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { VoxSettings } from "@/stores";

interface VoxSettingsPanelProps {
  settings: VoxSettings;
  onSettingsChange: (settings: Partial<VoxSettings>) => void;
  onReset: () => void;
}

export function VoxSettingsPanel({
  settings,
  onSettingsChange,
  onReset,
}: VoxSettingsPanelProps) {
  return (
    <div className="space-y-4">
      {/* Activation Threshold */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">
            Seuil d'activation
          </Label>
          <span className="text-xs font-mono text-muted-foreground">
            {(settings.activationThreshold * 100).toFixed(0)}%
          </span>
        </div>
        <Slider
          value={[settings.activationThreshold * 100]}
          onValueChange={([value]) =>
            onSettingsChange({ activationThreshold: value / 100 })
          }
          min={1}
          max={50}
          step={1}
          className="w-full"
        />
        <p className="text-[10px] text-muted-foreground">
          Niveau audio pour déclencher le VOX (plus bas = plus sensible)
        </p>
      </div>

      {/* Deactivation Threshold */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">
            Seuil de désactivation
          </Label>
          <span className="text-xs font-mono text-muted-foreground">
            {(settings.deactivationThreshold * 100).toFixed(0)}%
          </span>
        </div>
        <Slider
          value={[settings.deactivationThreshold * 100]}
          onValueChange={([value]) =>
            onSettingsChange({ deactivationThreshold: value / 100 })
          }
          min={1}
          max={30}
          step={1}
          className="w-full"
        />
        <p className="text-[10px] text-muted-foreground">
          Niveau pour relâcher le VOX (doit être inférieur au seuil
          d'activation)
        </p>
      </div>

      {/* Hold Time */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">
            Temps de maintien
          </Label>
          <span className="text-xs font-mono text-muted-foreground">
            {settings.holdTime} ms
          </span>
        </div>
        <Slider
          value={[settings.holdTime]}
          onValueChange={([value]) => onSettingsChange({ holdTime: value })}
          min={100}
          max={1000}
          step={50}
          className="w-full"
        />
        <p className="text-[10px] text-muted-foreground">
          Durée avant de relâcher après la fin de la parole
        </p>
      </div>

      {/* Reset Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onReset}
        className="w-full gap-2"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Valeurs par défaut
      </Button>
    </div>
  );
}
