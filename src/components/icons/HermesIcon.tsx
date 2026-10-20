import type { SVGProps } from "react";

/**
 * Marca do Órigo Agente (Hermes): um "H" cuja travessa é um raio.
 * Desenhada no traço dos demais ícones do painel (grade 24x24, cantos arredondados),
 * para continuar legível nos 16px usados na atividade recente.
 */
export default function HermesIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <path d="M6 4v16" />
      <path d="M18 4v16" />
      <path d="M6 10h6l-3 4h9" />
    </svg>
  );
}
