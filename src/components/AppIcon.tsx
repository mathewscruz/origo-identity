import { useState } from "react";
import { Cloud, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppIconProps {
  url?: string | null;
  origem?: string | null;
  size?: number;
  className?: string;
}

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export default function AppIcon({ url, origem, size = 20, className }: AppIconProps) {
  const [error, setError] = useState(false);
  const domain = url ? getDomain(url) : null;

  if (domain && !error) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=${size * 2}`}
        alt=""
        width={size}
        height={size}
        className={cn("rounded shrink-0", className)}
        onError={() => setError(true)}
        loading="lazy"
      />
    );
  }

  const iconSize = size * 0.7;
  const Icon = origem === "azure" ? Cloud : Globe;

  return (
    <div
      className={cn(
        "rounded shrink-0 flex items-center justify-center bg-muted",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Icon style={{ width: iconSize, height: iconSize }} className="text-muted-foreground" />
    </div>
  );
}
