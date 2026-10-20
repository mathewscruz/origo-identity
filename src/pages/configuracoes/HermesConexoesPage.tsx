import AgentePage from "./AgentePage";
import IntegracoesPage from "./IntegracoesPage";

export default function HermesConexoesPage() {
  return (
    <div className="space-y-6">
      <AgentePage />
      <div className="space-y-3">
        <div><h2 className="text-base font-semibold">Conexões</h2><p className="text-sm text-muted-foreground">Catálogos que o Hermes mantém atualizados e sistemas conectados.</p></div>
        <IntegracoesPage />
      </div>
    </div>
  );
}
