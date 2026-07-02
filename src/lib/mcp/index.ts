import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listColaboradoresTool from "./tools/list-colaboradores";
import getColaboradorTool from "./tools/get-colaborador";
import listTerceirosTool from "./tools/list-terceiros";
import listIamQueueTool from "./tools/list-iam-queue";
import approveIamItemTool from "./tools/approve-iam-item";
import startJmlEventTool from "./tools/start-jml-event";
import listEventosJmlTool from "./tools/list-eventos-jml";
import listAuditoriaTool from "./tools/list-auditoria";
import listAlertasTool from "./tools/list-alertas";
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
  version: "0.2.1",
  instructions:
    "Servidor MCP do Órigo Access & Identity (IGA para JML da Órigo Energia). Ferramentas de negócio permitem consultar colaboradores, terceiros, eventos JML, fila IAM, auditoria e alertas; iniciar eventos JML; aprovar/cancelar itens da fila IAM. Ferramentas admin (run_admin_sql, apply_migration, introspect_schema, invoke_edge_function) exigem papel admin e são auditadas — use com cautela e sempre com motivo claro. Todas as ações executam como o usuário autenticado via OAuth e respeitam RLS/papéis.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listColaboradoresTool,
    getColaboradorTool,
    listTerceirosTool,
    listIamQueueTool,
    approveIamItemTool,
    startJmlEventTool,
    listEventosJmlTool,
    listAuditoriaTool,
    listAlertasTool,
    // Admin (requer papel admin)
    runAdminSqlTool,
    applyMigrationTool,
    introspectSchemaTool,
    invokeEdgeFunctionTool,
    healthCheckTool,
  ],
});
