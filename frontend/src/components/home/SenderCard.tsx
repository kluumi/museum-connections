// SenderCard - Card component for sender dashboard links

import { Link } from "@tanstack/react-router";
import { ChevronRight, Video } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface SenderCardProps {
  city: "nantes" | "paris";
  title: string;
  description: string;
  href: string;
  features: string[];
}

export function SenderCard({
  city,
  title,
  description,
  href,
  features,
}: SenderCardProps) {
  const colorVar = `var(--${city})`;

  return (
    <Link to={href}>
      <Card
        className="group h-full cursor-pointer transition-all duration-300 hover:shadow-lg"
        style={{
          borderColor: `color-mix(in srgb, ${colorVar} 20%, transparent)`,
        }}
      >
        <CardHeader>
          <div className="flex items-start justify-between">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{
                backgroundColor: `color-mix(in srgb, ${colorVar} 10%, transparent)`,
                color: colorVar,
              }}
            >
              <Video className="h-6 w-6" />
            </div>
            <ChevronRight
              className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1"
              style={{ "--hover-color": colorVar } as React.CSSProperties}
            />
          </div>
          <CardTitle className="text-xl transition-colors">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: colorVar }}
                />
                {feature}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </Link>
  );
}
