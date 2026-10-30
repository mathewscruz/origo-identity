import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { appInitials, brandDomain } from "@/lib/appBrands";

interface AppIconProps {
  nome?: string | null;
  url?: string | null;
  origem?: string | null;
  size?: number;
  className?: string;
}

export default function AppIcon({ nome, url, size = 20, className }: AppIconProps) {
  const [error, setError] = useState(false);
  const domain = brandDomain(nome, url);

  if (domain && !error) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 rounded object-contain", className)}
        onError={() => setError(true)}
        loading="lazy"
      />
    );
  }

  const isVpn = /\bvpn\b/i.test(nome ?? "");
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground", className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {isVpn ? <ShieldCheck style={{ width: size * 0.55, height: size * 0.55 }} /> : appInitials(nome)}
    </div>
  );
}
