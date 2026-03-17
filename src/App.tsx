import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import ColaboradoresPage from "./pages/colaboradores/ColaboradoresPage";
import ColaboradorDetalhePage from "./pages/colaboradores/ColaboradorDetalhePage";
import TerceirosPage from "./pages/terceiros/TerceirosPage";
import TerceiroDetalhePage from "./pages/terceiros/TerceiroDetalhePage";
import EventosJMLPage from "./pages/eventos-jml/EventosJMLPage";
import EventoJMLDetalhePage from "./pages/eventos-jml/EventoJMLDetalhePage";
import AplicacoesPage from "./pages/aplicacoes/AplicacoesPage";
import PerfisAcessoPage from "./pages/perfis-acesso/PerfisAcessoPage";
import PerfilAcessoDetalhePage from "./pages/perfis-acesso/PerfilAcessoDetalhePage";
import ExcecoesPage from "./pages/excecoes/ExcecoesPage";
import RevisoesPage from "./pages/revisoes/RevisoesPage";
import RevisaoDetalhePage from "./pages/revisoes/RevisaoDetalhePage";
import RegrasPage from "./pages/regras/RegrasPage";
import RegraEditorPage from "./pages/regras/RegraEditorPage";
import MatrizPage from "./pages/matriz/MatrizPage";
import LicencasPage from "./pages/licencas/LicencasPage";
import AuditoriaPage from "./pages/auditoria/AuditoriaPage";
import AlertasPage from "./pages/alertas/AlertasPage";
import ConfiguracoesLayout from "./pages/configuracoes/ConfiguracoesLayout";
import CargosPage from "./pages/configuracoes/CargosPage";
import AreasPage from "./pages/configuracoes/AreasPage";
import EmpresasPage from "./pages/configuracoes/EmpresasPage";
import LocalidadesPage from "./pages/configuracoes/LocalidadesPage";
import OperadoresPage from "./pages/configuracoes/OperadoresPage";
import ParametrosPage from "./pages/configuracoes/ParametrosPage";
import IntegracoesPage from "./pages/configuracoes/IntegracoesPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/colaboradores" element={<ColaboradoresPage />} />
            <Route path="/colaboradores/:id" element={<ColaboradorDetalhePage />} />
            <Route path="/terceiros" element={<TerceirosPage />} />
            <Route path="/terceiros/:id" element={<TerceiroDetalhePage />} />
            <Route path="/eventos-jml" element={<EventosJMLPage />} />
            <Route path="/eventos-jml/:id" element={<EventoJMLDetalhePage />} />
            <Route path="/aplicacoes" element={<AplicacoesPage />} />
            <Route path="/aplicacoes/:id" element={<PlaceholderPage title="Detalhe da Aplicação" />} />
            <Route path="/perfis-acesso" element={<PerfisAcessoPage />} />
            <Route path="/perfis-acesso/:id" element={<PerfilAcessoDetalhePage />} />
            <Route path="/excecoes" element={<ExcecoesPage />} />
            <Route path="/excecoes/:id" element={<PlaceholderPage title="Detalhe da Exceção" />} />
            <Route path="/revisoes" element={<RevisoesPage />} />
            <Route path="/revisoes/:id" element={<RevisaoDetalhePage />} />
            <Route path="/regras" element={<RegrasPage />} />
            <Route path="/regras/nova" element={<RegraEditorPage />} />
            <Route path="/regras/:id/editar" element={<RegraEditorPage />} />
            <Route path="/matriz" element={<MatrizPage />} />
            <Route path="/licencas" element={<LicencasPage />} />
            <Route path="/licencas/:id" element={<PlaceholderPage title="Detalhe da Licença" />} />
            <Route path="/auditoria" element={<AuditoriaPage />} />
            <Route path="/alertas" element={<AlertasPage />} />
            <Route path="/configuracoes" element={<ConfiguracoesLayout />}>
              <Route index element={<Navigate to="/configuracoes/cargos" replace />} />
              <Route path="cargos" element={<CargosPage />} />
              <Route path="areas" element={<AreasPage />} />
              <Route path="empresas" element={<EmpresasPage />} />
              <Route path="localidades" element={<LocalidadesPage />} />
              <Route path="operadores" element={<OperadoresPage />} />
              <Route path="parametros" element={<ParametrosPage />} />
              <Route path="integracoes" element={<IntegracoesPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
