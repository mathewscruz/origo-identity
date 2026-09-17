import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import ColaboradoresPage from "./pages/colaboradores/ColaboradoresPage";
import ColaboradorDetalhePage from "./pages/colaboradores/ColaboradorDetalhePage";
import TerceirosPage from "./pages/terceiros/TerceirosPage";
import TerceiroDetalhePage from "./pages/terceiros/TerceiroDetalhePage";
import EventoJMLDetalhePage from "./pages/eventos-jml/EventoJMLDetalhePage";
import EventosJMLPage from "./pages/eventos-jml/EventosJMLPage";
import AplicacoesPage from "./pages/aplicacoes/AplicacoesPage";
import AplicacaoDetalhePage from "./pages/aplicacoes/AplicacaoDetalhePage";
import PerfisAcessoPage from "./pages/perfis-acesso/PerfisAcessoPage";
import PerfilAcessoDetalhePage from "./pages/perfis-acesso/PerfilAcessoDetalhePage";
import ExcecoesPage from "./pages/excecoes/ExcecoesPage";
import RevisoesPage from "./pages/revisoes/RevisoesPage";
import RevisaoDetalhePage from "./pages/revisoes/RevisaoDetalhePage";
import RevisaoExternaPage from "./pages/revisoes/RevisaoExternaPage";

import LicencasPage from "./pages/licencas/LicencasPage";
import AuditoriaPage from "./pages/auditoria/AuditoriaPage";
import SoDPage from "./pages/sod/SoDPage";
import PrivilegiadosPage from "./pages/privilegiados/PrivilegiadosPage";
import RelatoriosPage from "./pages/relatorios/RelatoriosPage";
import AlertasPage from "./pages/alertas/AlertasPage";
import ConfiguracoesLayout from "./pages/configuracoes/ConfiguracoesLayout";
import CargosPage from "./pages/configuracoes/CargosPage";
import AreasPage from "./pages/configuracoes/AreasPage";
import EmpresasPage from "./pages/configuracoes/EmpresasPage";
import LocalidadesPage from "./pages/configuracoes/LocalidadesPage";

import ParametrosPage from "./pages/configuracoes/ParametrosPage";
import IntegracoesPage from "./pages/configuracoes/IntegracoesPage";
import UsuariosPage from "./pages/admin/UsuariosPage";
import LoginPage from "./pages/auth/LoginPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import OAuthConsentPage from "./pages/auth/OAuthConsentPage";
import FilaProvisionamentoPage from "./pages/fila-provisionamento/FilaProvisionamentoPage";
import SolicitacaoDetalhePage from "./pages/fila-provisionamento/SolicitacaoDetalhePage";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/** /aprovacao-iam virou a aba "Aguardando aprovação" da fila — mantém links antigos (alertas, e-mails). */
function AprovacaoRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("tab", "aprovacao");
  return <Navigate to={`/fila-provisionamento?${params.toString()}`} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsentPage />} />
            <Route path="/auth/oauth/consent" element={<OAuthConsentPage />} />
            <Route path="/revisao-externa/:token" element={<RevisaoExternaPage />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/fila-provisionamento" element={<FilaProvisionamentoPage />} />
              <Route path="/aprovacao-iam" element={<AprovacaoRedirect />} />
              <Route path="/fila-provisionamento/:id" element={<SolicitacaoDetalhePage />} />
              <Route path="/colaboradores" element={<ColaboradoresPage />} />
              <Route path="/colaboradores/:id" element={<ColaboradorDetalhePage />} />
              <Route path="/terceiros" element={<TerceirosPage />} />
              <Route path="/terceiros/:id" element={<TerceiroDetalhePage />} />
              <Route path="/eventos-jml" element={<EventosJMLPage />} />
              <Route path="/eventos-jml/:id" element={<EventoJMLDetalhePage />} />
              <Route path="/aplicacoes" element={<AplicacoesPage />} />
              <Route path="/aplicacoes/:id" element={<AplicacaoDetalhePage />} />
              <Route path="/perfis-acesso" element={<PerfisAcessoPage />} />
              <Route path="/perfis-acesso/:id" element={<PerfilAcessoDetalhePage />} />
              <Route path="/excecoes" element={<ExcecoesPage />} />
              <Route path="/excecoes/:id" element={<ExcecoesPage />} />
              <Route path="/revisoes" element={<RevisoesPage />} />
              <Route path="/revisoes/:id" element={<RevisaoDetalhePage />} />
              
              <Route path="/licencas" element={<LicencasPage />} />
              <Route path="/licencas/:id" element={<LicencasPage />} />
              <Route path="/sod" element={<SoDPage />} />
              <Route path="/privilegiados" element={<PrivilegiadosPage />} />
              <Route path="/relatorios" element={<RelatoriosPage />} />
              <Route path="/auditoria" element={<AuditoriaPage />} />
              <Route path="/alertas" element={<AlertasPage />} />
              <Route path="/admin/usuarios" element={<UsuariosPage />} />
              <Route path="/configuracoes" element={<ConfiguracoesLayout />}>
                <Route index element={<Navigate to="/configuracoes/cargos" replace />} />
                <Route path="cargos" element={<CargosPage />} />
                <Route path="areas" element={<AreasPage />} />
                <Route path="empresas" element={<EmpresasPage />} />
                <Route path="localidades" element={<LocalidadesPage />} />
                
                <Route path="parametros" element={<ParametrosPage />} />
                <Route path="integracoes" element={<IntegracoesPage />} />
                <Route path="auditoria" element={<Navigate to="/auditoria" replace />} />
                <Route path="alertas" element={<Navigate to="/alertas" replace />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
