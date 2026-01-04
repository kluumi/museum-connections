import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface DeviceSelectorProps {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function DeviceSelector({
  devices,
  selectedDeviceId,
  onSelect,
  disabled = false,
  placeholder = "Sélectionner...",
  className,
}: DeviceSelectorProps) {
  // Use empty string for controlled component when no selection
  // This prevents the "uncontrolled to controlled" warning
  const value = selectedDeviceId ?? "";

  const handleValueChange = (newValue: string) => {
    console.log("🎯 DeviceSelector change:", {
      from: selectedDeviceId,
      to: newValue,
      isSame: selectedDeviceId === newValue,
      placeholder,
    });
    // Only call onSelect if value actually changed
    if (selectedDeviceId !== newValue) {
      console.log("🎯 Calling onSelect with:", newValue);
      onSelect(newValue);
    } else {
      console.log("🎯 Skipping onSelect - same value");
    }
  };

  return (
    <Select
      value={value}
      onValueChange={handleValueChange}
      disabled={disabled || devices.length === 0}
    >
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue
          placeholder={devices.length === 0 ? "Aucun appareil" : placeholder}
        />
      </SelectTrigger>
      <SelectContent>
        {devices
          .filter(
            (device, index, self) =>
              // Remove duplicates by deviceId
              index === self.findIndex((d) => d.deviceId === device.deviceId),
          )
          .map((device) => (
            <SelectItem key={device.deviceId} value={device.deviceId}>
              {device.label || `Appareil ${device.deviceId.slice(0, 8)}`}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
