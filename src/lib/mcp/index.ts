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

// OAuth issuer MUST be the direct supabase.co host, built from project ref
// (inlined at build time by Vite; import-safe for the manifest extractor).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "origo-access-identity-mcp",
  title: "Órigo Access & Identity",
  version: "0.1.0",
  instructions:
    "Servidor MCP do Órigo Access & Identity (IGA para JML da Órigo Energia). Ferramentas permitem consultar colaboradores, terceiros, eventos JML, fila IAM, auditoria e alertas; iniciar eventos JML; aprovar/cancelar itens da fila IAM. Todas as ações executam como o usuário autenticado via OAuth e respeitam RLS/pápeis. Prefira sempre buscar contexto antes de agir e registre motivo claro em ações destrutivas.",
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
  ],
});
