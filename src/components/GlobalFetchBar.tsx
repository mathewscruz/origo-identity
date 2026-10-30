import { useIsFetching } from "@tanstack/react-query";

/** Barra fina animada no topo enquanto há dados sendo buscados. */
export default function GlobalFetchBar() {
  const n = useIsFetching();
  if (!n) return null;
  return (
    <div role="progressbar" aria-label="Atualizando dados" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-primary/15">
      <div className="h-full w-1/3 animate-fetch-bar rounded-full bg-primary" />
    </div>
  );
}
