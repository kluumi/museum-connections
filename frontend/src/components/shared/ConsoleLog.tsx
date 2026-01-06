import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Info,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type LogLevel =
  | "info"
  | "success"
  | "error"
  | "warning"
  | "nantes"
  | "paris";

export interface LogEntry {
  id: string;
  message: string;
  level: LogLevel;
  timestamp: Date;
}

interface ConsoleLogProps {
  entries: LogEntry[];
  onClear?: () => void;
  accentColor?: "nantes" | "paris" | "operator";
  className?: string;
  defaultCollapsed?: boolean;
  /** Optional title to display instead of "Console" */
  title?: string;
}

const levelStyles: Record<LogLevel, { text: string; icon: React.ElementType }> =
  {
    info: { text: "text-muted-foreground", icon: Info },
    success: { text: "text-emerald-500", icon: CheckCircle },
    error: { text: "text-destructive", icon: XCircle },
    warning: { text: "text-amber-500", icon: AlertTriangle },
    nantes: { text: "text-primary", icon: Info },
    paris: { text: "text-primary", icon: Info },
  };

function formatTime(date: Date): string {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ConsoleLog({
  entries,
  onClear,
  accentColor: _accentColor = "nantes",
  className,
  defaultCollapsed = false,
  title,
}: ConsoleLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (scrollRef.current && !isCollapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, isCollapsed]);

  return (
    <Card className={className}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Terminal className="h-4 w-4" />
            {title ?? "Console"}
            {entries.length > 0 && (
              <span className="text-xs font-normal">({entries.length})</span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            {onClear && entries.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onClear}
                title="Effacer les messages"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      {!isCollapsed && (
        <CardContent className="px-0 pb-0">
          <ScrollArea className="h-[140px]" ref={scrollRef}>
            <div className="space-y-0.5 px-4 pb-3">
              {entries.length === 0 ? (
                <p className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                  <span className="opacity-50">{">"}</span>
                  En attente d'événements...
                </p>
              ) : (
                entries.map((entry) => {
                  const style = levelStyles[entry.level];
                  const Icon = style.icon;
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "flex items-start gap-2 py-1 font-mono text-xs",
                        style.text,
                      )}
                    >
                      <Icon className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="flex-1">{entry.message}</span>
                      <span className="shrink-0 text-muted-foreground/50">
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}

// Generate UUID - fallback for non-secure contexts (HTTP)
// crypto.randomUUID() is only available in secure contexts (HTTPS/localhost)
function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: simple unique ID using Math.random and timestamp
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function createLogEntry(
  message: string,
  level: LogLevel = "info",
): LogEntry {
  return {
    id: generateId(),
    message,
    level,
    timestamp: new Date(),
  };
}
