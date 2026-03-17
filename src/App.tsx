import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import AplicacoesPage from "./pages/aplicacoes/AplicacoesPage";
import PerfisAcessoPage from "./pages/perfis-acesso/PerfisAcessoPage";
import PerfilAcessoDetalhePage from "./pages/perfis-acesso/PerfilAcessoDetalhePage";
import RegrasPage from "./pages/regras/RegrasPage";
import RegraEditorPage from "./pages/regras/RegraEditorPage";
import MatrizPage from "./pages/matriz/MatrizPage";
import ConfiguracoesLayout from "./pages/configuracoes/ConfiguracoesLayout";
import CargosPage from "./pages/configuracoes/CargosPage";
import AreasPage from "./pages/configuracoes/AreasPage";
import EmpresasPage from "./pages/configuracoes/EmpresasPage";
import LocalidadesPage from "./pages/configuracoes/LocalidadesPage";
import OperadoresPage from "./pages/configuracoes/OperadoresPage";
import ParametrosPage from "./pages/configuracoes/ParametrosPage";
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
            <Route path="/colaboradores" element={<PlaceholderPage title="Colaboradores" description="Gestão de funcionários internos" />} />
            <Route path="/colaboradores/:id" element={<PlaceholderPage title="Detalhe do Colaborador" />} />
            <Route path="/terceiros" element={<PlaceholderPage title="Terceiros" description="Ciclo de vida de terceiros com controle de contrato" />} />
            <Route path="/terceiros/:id" element={<PlaceholderPage title="Detalhe do Terceiro" />} />
            <Route path="/eventos-jml" element={<PlaceholderPage title="Eventos JML" description="Central de processamento e monitoramento JML" />} />
            <Route path="/eventos-jml/:id" element={<PlaceholderPage title="Detalhe do Evento" />} />
            <Route path="/aplicacoes" element={<AplicacoesPage />} />
            <Route path="/aplicacoes/:id" element={<PlaceholderPage title="Detalhe da Aplicação" />} />
            <Route path="/perfis-acesso" element={<PerfisAcessoPage />} />
            <Route path="/perfis-acesso/:id" element={<PerfilAcessoDetalhePage />} />
            <Route path="/excecoes" element={<PlaceholderPage title="Exceções de Acesso" description="Concessões fora da regra com justificativa e aprovação" />} />
            <Route path="/excecoes/:id" element={<PlaceholderPage title="Detalhe da Exceção" />} />
            <Route path="/revisoes" element={<PlaceholderPage title="Revisões de Acesso" description="Campanhas periódicas de recertificação" />} />
            <Route path="/revisoes/:id" element={<PlaceholderPage title="Detalhe da Revisão" />} />
            <Route path="/regras" element={<RegrasPage />} />
            <Route path="/regras/nova" element={<RegraEditorPage />} />
            <Route path="/regras/:id/editar" element={<RegraEditorPage />} />
            <Route path="/matriz" element={<MatrizPage />} />
            <Route path="/licencas" element={<PlaceholderPage title="Licenças" description="Inventário, atribuição e revogação de licenças" />} />
            <Route path="/licencas/:id" element={<PlaceholderPage title="Detalhe da Licença" />} />
            <Route path="/auditoria" element={<PlaceholderPage title="Auditoria" description="Logs completos com evidências e relatórios" />} />
            <Route path="/alertas" element={<PlaceholderPage title="Alertas" description="Central de notificações operacionais" />} />
            <Route path="/configuracoes" element={<ConfiguracoesLayout />}>
              <Route index element={<Navigate to="/configuracoes/cargos" replace />} />
              <Route path="cargos" element={<CargosPage />} />
              <Route path="areas" element={<AreasPage />} />
              <Route path="empresas" element={<EmpresasPage />} />
              <Route path="localidades" element={<LocalidadesPage />} />
              <Route path="operadores" element={<OperadoresPage />} />
              <Route path="parametros" element={<ParametrosPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
