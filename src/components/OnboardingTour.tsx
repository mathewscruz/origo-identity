import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export interface TourStep {
  target: string;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
}

interface OnboardingTourProps {
  pageKey: string;
  steps: TourStep[];
  delay?: number;
}

function getStorageKey(userId: string, pageKey: string) {
  return `origo_tour_${userId}_${pageKey}`;
}

export default function OnboardingTour({ pageKey, steps, delay = 600 }: OnboardingTourProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const tooltipRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const userId = user?.id;

  // Check if already seen
  useEffect(() => {
    if (!userId || steps.length === 0) return;
    const seen = localStorage.getItem(getStorageKey(userId, pageKey));
    if (seen) return;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [userId, pageKey, steps.length, delay]);

  const markSeen = useCallback(() => {
    if (userId) localStorage.setItem(getStorageKey(userId, pageKey), "true");
    setVisible(false);
  }, [userId, pageKey]);

  const handleSkip = () => markSeen();
  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      markSeen();
    }
  };
  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  // Position calculation
  const updatePosition = useCallback(() => {
    if (!visible || !steps[currentStep]) return;
    const step = steps[currentStep];
    const el = document.querySelector(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Small delay after scroll
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      setRect(r);
    });
  }, [visible, currentStep, steps]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [updatePosition]);

  // Calculate tooltip position after rect updates
  useEffect(() => {
    if (!rect || !visible) return;
    const step = steps[currentStep];
    const pos = step.position || "bottom";
    const pad = 12;
    const tooltipW = 340;
    const tooltipH = tooltipRef.current?.offsetHeight || 180;

    let top = 0;
    let left = 0;

    switch (pos) {
      case "bottom":
        top = rect.bottom + pad;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
      case "top":
        top = rect.top - tooltipH - pad;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tooltipH / 2;
        left = rect.left - tooltipW - pad;
        break;
      case "right":
        top = rect.top + rect.height / 2 - tooltipH / 2;
        left = rect.right + pad;
        break;
    }

    // Clamp to viewport
    left = Math.max(12, Math.min(left, window.innerWidth - tooltipW - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - tooltipH - 12));

    setTooltipStyle({ top, left, width: tooltipW });
  }, [rect, currentStep, steps, visible]);

  if (!visible || steps.length === 0) return null;

  const step = steps[currentStep];
  const padding = 6;

  return (
    <>
      {/* Overlay with cutout */}
      <div className="fixed inset-0 z-[9998]" onClick={(e) => e.stopPropagation()}>
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
          <defs>
            <mask id="tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {rect && (
                <rect
                  x={rect.left - padding}
                  y={rect.top - padding}
                  width={rect.width + padding * 2}
                  height={rect.height + padding * 2}
                  rx="8"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.6)"
            mask="url(#tour-mask)"
            style={{ pointerEvents: "all" }}
            onClick={handleSkip}
          />
        </svg>

        {/* Highlight ring */}
        {rect && (
          <div
            className="absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent transition-all duration-300"
            style={{
              top: rect.top - padding,
              left: rect.left - padding,
              width: rect.width + padding * 2,
              height: rect.height + padding * 2,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Tooltip */}
        <div
          ref={tooltipRef}
          className="fixed bg-card border border-border rounded-xl shadow-2xl p-5 z-[9999] animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
          style={tooltipStyle}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={handleSkip}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-3">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? "w-6 bg-primary"
                    : i < currentStep
                    ? "w-1.5 bg-primary/50"
                    : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
            <span className="ml-auto text-xs text-muted-foreground">
              {currentStep + 1}/{steps.length}
            </span>
          </div>

          <h3 className="text-sm font-semibold text-foreground mb-1.5">{step.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">{step.description}</p>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleSkip} className="text-xs">
              Pular
            </Button>
            <div className="flex-1" />
            {currentStep > 0 && (
              <Button variant="outline" size="sm" onClick={handlePrev} className="text-xs">
                Anterior
              </Button>
            )}
            <Button size="sm" onClick={handleNext} className="text-xs">
              {currentStep === steps.length - 1 ? "Concluir" : "Próximo"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
