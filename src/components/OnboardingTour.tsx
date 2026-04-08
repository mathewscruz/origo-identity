import { useState, useEffect, useCallback, useRef, useId } from "react";
import { createPortal } from "react-dom";
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

/** Find the nearest scrollable ancestor */
function getScrollParent(el: Element): Element | null {
  let parent = el.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    if (/(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/** Check if two rects are "close enough" (stable) */
function rectsEqual(a: DOMRect, b: DOMRect, tolerance = 2): boolean {
  return (
    Math.abs(a.top - b.top) < tolerance &&
    Math.abs(a.left - b.left) < tolerance &&
    Math.abs(a.width - b.width) < tolerance &&
    Math.abs(a.height - b.height) < tolerance
  );
}

/** Best tooltip position that fits viewport */
function bestPosition(
  rect: DOMRect,
  preferred: "top" | "bottom" | "left" | "right",
  tooltipW: number,
  tooltipH: number
): "top" | "bottom" | "left" | "right" {
  const pad = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const fits: Record<string, boolean> = {
    bottom: rect.bottom + pad + tooltipH < vh,
    top: rect.top - pad - tooltipH > 0,
    right: rect.right + pad + tooltipW < vw,
    left: rect.left - pad - tooltipW > 0,
  };

  if (fits[preferred]) return preferred;
  // Try opposite, then sides
  const fallbacks: Record<string, string[]> = {
    bottom: ["top", "right", "left"],
    top: ["bottom", "right", "left"],
    right: ["left", "bottom", "top"],
    left: ["right", "bottom", "top"],
  };
  for (const alt of fallbacks[preferred]) {
    if (fits[alt]) return alt as any;
  }
  return "bottom";
}

export default function OnboardingTour({ pageKey, steps, delay = 800 }: OnboardingTourProps) {
  const { user } = useAuth();
  const maskId = useId().replace(/:/g, "_");
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [actualPosition, setActualPosition] = useState<"top" | "bottom" | "left" | "right">("bottom");
  const tooltipRef = useRef<HTMLDivElement>(null);
  const stabilizeRef = useRef<ReturnType<typeof setTimeout>>();
  const scrollContainerRef = useRef<Element | null>(null);

  const userId = user?.id;

  // Show tour on first visit
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
    if (currentStep < steps.length - 1) setCurrentStep((s) => s + 1);
    else markSeen();
  };
  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  /**
   * Core: measure element, scroll if needed, wait for stabilization,
   * then set rect. Retries up to 10 times waiting for the element to
   * stop moving (page animations, scroll, layout shifts).
   */
  const measureTarget = useCallback(() => {
    if (!visible || !steps[currentStep]) return;
    clearTimeout(stabilizeRef.current);

    const step = steps[currentStep];
    const el = document.querySelector(step.target);

    if (!el) {
      // Target not found — skip step
      if (currentStep < steps.length - 1) setCurrentStep((s) => s + 1);
      else markSeen();
      return;
    }

    // Find scroll container (usually <main>)
    const scrollParent = getScrollParent(el) || document.querySelector("main");
    scrollContainerRef.current = scrollParent;

    // Ensure element is visible in viewport
    const elRect = el.getBoundingClientRect();
    const headerHeight = 64; // fixed header
    const viewTop = headerHeight;
    const viewBottom = window.innerHeight - 20;

    if (elRect.top < viewTop || elRect.bottom > viewBottom) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Poll until stable
    let lastRect = el.getBoundingClientRect();
    let attempts = 0;
    const maxAttempts = 15;

    const pollStability = () => {
      attempts++;
      const current = el.getBoundingClientRect();

      if (rectsEqual(lastRect, current) && attempts >= 3) {
        // Stable — commit
        setRect(current);
        return;
      }

      lastRect = current;

      if (attempts >= maxAttempts) {
        // Give up waiting, use current
        setRect(current);
        return;
      }

      stabilizeRef.current = setTimeout(pollStability, 100);
    };

    // Start polling after a short delay for scroll to begin
    stabilizeRef.current = setTimeout(pollStability, 200);
  }, [visible, currentStep, steps, markSeen]);

  // Measure on step change
  useEffect(() => {
    measureTarget();
    return () => clearTimeout(stabilizeRef.current);
  }, [measureTarget]);

  // Listen to scroll and resize
  useEffect(() => {
    if (!visible) return;

    let rafId = 0;
    const remeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const step = steps[currentStep];
        if (!step) return;
        const el = document.querySelector(step.target);
        if (el) setRect(el.getBoundingClientRect());
      });
    };

    const mainEl = document.querySelector("main");

    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    mainEl?.addEventListener("scroll", remeasure);

    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
      mainEl?.removeEventListener("scroll", remeasure);
      cancelAnimationFrame(rafId);
    };
  }, [visible, currentStep, steps]);

  // Calculate tooltip position with auto-flip
  useEffect(() => {
    if (!rect || !visible) return;
    const step = steps[currentStep];
    const preferred = step.position || "bottom";
    const pad = 14;
    const tooltipW = 340;
    const tooltipH = tooltipRef.current?.offsetHeight || 180;

    const pos = bestPosition(rect, preferred, tooltipW, tooltipH);
    setActualPosition(pos);

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
    <div className="fixed inset-0 z-[9998]" onClick={(e) => e.stopPropagation()}>
      {/* Overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
        <defs>
          <mask id={`tour-mask-${maskId}`}>
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
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.55)"
          mask={`url(#tour-mask-${maskId})`}
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
        <button
          onClick={handleSkip}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Step indicators */}
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
  );
}
