// ObsReceiverCard - Card component for OBS receiver links

import { Link } from "@tanstack/react-router";
import { Check, Copy, ExternalLink, Monitor } from "lucide-react";
import { useCallback, useState } from "react";
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
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface ObsReceiverCardProps {
  title: string;
  description: string;
  href: string;
  color: "nantes" | "paris";
  details: string[];
}

export function ObsReceiverCard({
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
          {details.map((detail) => (
            <li key={detail} className="flex items-center gap-2">
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
