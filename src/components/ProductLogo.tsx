/** Logos simplificados (SVG inline) reconhecidos pelo nome comercial da licença. */
type Kind = "m365" | "teams" | "exchange" | "dynamics" | "power" | "copilot" | "project" | "visio" | "entra" | "defender" | "windows" | "generic";

export function productKind(nome: string): Kind {
  const n = nome.toLowerCase();
  if (n.includes("teams")) return "teams";
  if (n.includes("exchange")) return "exchange";
  if (n.includes("dynamics")) return "dynamics";
  if (n.includes("copilot")) return "copilot";
  if (n.includes("power")) return "power";
  if (n.includes("project")) return "project";
  if (n.includes("visio")) return "visio";
  if (n.includes("entra") || n.includes("azure")) return "entra";
  if (n.includes("defender")) return "defender";
  if (n.includes("windows")) return "windows";
  if (n.includes("365") || n.includes("office") || n.includes("microsoft")) return "m365";
  return "generic";
}

function Tile({ bg, children }: { bg: string; children: React.ReactNode }) {
  return <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden><rect width="32" height="32" rx="8" fill={bg} />{children}</svg>;
}

export default function ProductLogo({ nome }: { nome: string }) {
  const k = productKind(nome);
  switch (k) {
    case "m365":
      return <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden><path d="M6 9l12-5 8 3v18l-8 3-12-5z" fill="#EB3C00" /><path d="M18 4l8 3v18l-8 3z" fill="#FF8F6B" /><path d="M10 11l8-2v14l-8-2z" fill="#fff" opacity=".9" /></svg>;
    case "teams":
      return <Tile bg="#5059C9"><text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">T</text></Tile>;
    case "exchange":
      return <Tile bg="#0A64AD"><text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">E</text></Tile>;
    case "dynamics":
      return <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden><path d="M8 4l16 7v10L8 28z" fill="#0B53CE" /><path d="M8 4l16 7-16 7z" fill="#2266E3" /></svg>;
    case "power":
      return <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden><path d="M6 6h12l8 10-8 10H6l8-10z" fill="#0066FF" /><path d="M14 16L6 6h12l8 10z" fill="#3F8CFF" /></svg>;
    case "copilot":
      return <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden><defs><linearGradient id="cp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2AA0F8" /><stop offset=".5" stopColor="#B04BD8" /><stop offset="1" stopColor="#F7A93B" /></linearGradient></defs><path d="M10 5h9c3 0 4 2 5 5l3 12c1 3-1 5-4 5h-9c-3 0-4-2-5-5L6 10c-1-3 1-5 4-5z" fill="url(#cp)" /></svg>;
    case "project":
      return <Tile bg="#31752F"><text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">P</text></Tile>;
    case "visio":
      return <Tile bg="#3955A3"><text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">V</text></Tile>;
    case "entra":
      return <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden><path d="M16 3l11 13-11 13L5 16z" fill="#0078D4" /><path d="M16 9l6 7-6 7-6-7z" fill="#50E6FF" /></svg>;
    case "defender":
      return <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden><path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z" fill="#0F6CBD" /></svg>;
    case "windows":
      return <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden><path d="M4 6l11-1.5v11H4zM17 4.2L28 3v12.5H17zM4 17h11v11L4 26.5zM17 17h11v12l-11-1.5z" fill="#00A4EF" /></svg>;
    default:
      return <Tile bg="hsl(var(--muted))"><path d="M16 8l7 4v8l-7 4-7-4v-8z" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" /></Tile>;
  }
}
