import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listColaboradoresTool from "./tools/list-colaboradores";
import getColaboradorTool from "./tools/get-colaborador";
import listTerceirosTool from "./tools/list-terceiros";
import listCatalogTool from "./tools/list-catalog";
import getEffectiveAccessTool from "./tools/get-effective-access";
import listIamQueueTool from "./tools/list-iam-queue";
import approveIamItemTool from "./tools/approve-iam-item";
import requestAccessTool from "./tools/request-access";
import resetPasswordTool from "./tools/reset-password";
import startJmlEventTool from "./tools/start-jml-event";
import listEventosJmlTool from "./tools/list-eventos-jml";
import listAuditoriaTool from "./tools/list-auditoria";
import listAlertasTool from "./tools/list-alertas";
import getInboxTool from "./tools/get-inbox";
import { listReviewsTool, getReviewTool, createReviewTool, decideReviewTool, closeReviewTool, cancelReviewTool } from "./tools/reviews";
import { decideExceptionTool, resolveQuarantineTool, ackAlertsTool, revalidateTerceiroTool, setTerceiroStatusTool, retryFailedTool } from "./tools/governance";
import runAdminSqlTool from "./tools/run-admin-sql";
import applyMigrationTool from "./tools/apply-migration";
import introspectSchemaTool from "./tools/introspect-schema";
import invokeEdgeFunctionTool from "./tools/invoke-edge-function";
import healthCheckTool from "./tools/health-check";

// OAuth issuer MUST be the direct supabase.co host, built from project ref
// (inlined at build time by Vite; import-safe for the manifest extractor).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "origo-access-identity-mcp",
  title: "Órigo Access & Identity",
  version: "0.4.0",
  instructions:
    "Servidor MCP do Órigo Access & Identity (IGA da Órigo Energia). Você é o Hermes, o cérebro operacional do sistema: decide, orquestra e explica; o Órigo Agente (executor) é o ÚNICO que toca AD/Entra/SharePoint/apps, sempre a partir da fila IAM. Nunca insira na fila nem altere dados de identidade via SQL — use as ferramentas, que passam por RPCs auditadas e respeitam papéis/RLS do usuário OAuth conectado.\n\n" +
    "CICLO OPERACIONAL (a cada turno ou chamado): 1) get_inbox → veja aprovações pendentes, falhas, exceções, revisões abertas/atrasadas, quarentena do RH, terceiros a vencer/revalidar, alertas críticos e se o agente está online. 2) Trate cada fila: approve_iam_item (aprovar/rejeitar itens em nome do usuário — auto-aprovação é recusada), retry_failed_items depois de corrigir a causa, decide_exception, resolve_quarantine, revalidate_terceiro / set_terceiro_status, ack_alerts só depois de tratar. 3) Revisões: create_review (por aplicação, por gestor ou todos os gestores) envia o link ao responsável; quando o gestor/owner responder pelo chamado, decide_review_items e close_review — as revogações entram na fila já aprovadas e o agente executa; acompanhe com get_review (bloco execucao). 4) Registre no chamado o que foi feito e o que ficou aguardando (aprovação, agente offline, e-mail sem destinatário).\n\n" +
    "CHAMADOS (GLPI): identifique a pessoa (list_colaboradores/get_colaborador/list_terceiros), o recurso (list_catalog), confira get_effective_access antes de conceder/revogar, e use request_access, reset_password ou start_jml_event (joiner/mover/leaver/pré-leaver). Acesso fora do perfil do cargo é exceção com justificativa e validade. Ações destrutivas (leaver, revogação em massa, desligar terceiro) exigem confirmação explícita do solicitante no chamado.\n\n" +
    "Ferramentas admin (run_admin_sql, apply_migration, introspect_schema, invoke_edge_function) exigem papel admin/platform_admin, são auditadas e servem para diagnóstico/manutenção — nunca para provisionar.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    // Ciclo operacional
    getInboxTool,
    listIamQueueTool,
    approveIamItemTool,
    retryFailedTool,
    decideExceptionTool,
    resolveQuarantineTool,
    ackAlertsTool,
    listAlertasTool,
    // Identidades e acessos
    listColaboradoresTool,
    getColaboradorTool,
    listTerceirosTool,
    revalidateTerceiroTool,
    setTerceiroStatusTool,
    listCatalogTool,
    getEffectiveAccessTool,
    requestAccessTool,
    resetPasswordTool,
    startJmlEventTool,
    listEventosJmlTool,
    // Revisões de acesso
    listReviewsTool,
    getReviewTool,
    createReviewTool,
    decideReviewTool,
    closeReviewTool,
    cancelReviewTool,
    // Auditoria
    listAuditoriaTool,
    // Admin (requer papel admin)
    runAdminSqlTool,
    applyMigrationTool,
    introspectSchemaTool,
    invokeEdgeFunctionTool,
    healthCheckTool,
  ],
});
