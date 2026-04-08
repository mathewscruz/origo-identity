import origoLogo from "@/assets/origo-logo.png";

interface EmptyStateProps {
  message?: string;
  size?: "sm" | "md" | "lg";
}

const sizeConfig = {
  sm: { logo: 20, text: "text-xs", gap: "gap-1.5", py: "py-2" },
  md: { logo: 32, text: "text-sm", gap: "gap-2", py: "py-6" },
  lg: { logo: 48, text: "text-base", gap: "gap-3", py: "py-10" },
};

export default function EmptyState({ message = "Nenhum registro encontrado.", size = "md" }: EmptyStateProps) {
  const cfg = sizeConfig[size];

  return (
    <div className={`flex items-center justify-center ${cfg.gap} ${cfg.py} w-full`}>
      <img
        src={origoLogo}
        alt="Órigo"
        width={cfg.logo}
        height={cfg.logo}
        className="grayscale opacity-30 select-none"
        draggable={false}
      />
      <span className={`${cfg.text} text-muted-foreground`}>{message}</span>
    </div>
  );
}
