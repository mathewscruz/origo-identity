import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mapeia cada tabela do banco para as chaves de cache (react-query) que
 * devem ser invalidadas quando qualquer linha dessa tabela mudar.
 * Assim todas as páginas se atualizam sozinhas, sem refresh manual.
 */
const TABLE_QUERY_KEYS: Record<string, string[]> = {
  colaboradores: ["colaboradores", "colaborador", "dashboard_kpis", "dashboard_colabs_status", "matriz"],
  terceiros: ["terceiros", "terceiro", "dashboard_kpis"],
  aplicacoes: ["aplicacoes", "aplicacao", "dashboard_kpis"],
  perfis_acesso: ["perfis_acesso", "perfil_acesso", "dashboard_kpis", "matriz"],
  perfil_atribuicoes: ["perfil_atribuicoes", "matriz", "colab_individual_queue", "efetivo"],
  perfil_grupos: ["perfil_acesso", "perfis_acesso", "efetivo"],
  perfil_licencas: ["perfil_acesso", "perfis_acesso", "efetivo"],
  perfil_aplicacoes: ["perfil_acesso", "perfis_acesso", "efetivo"],
  perfil_sharepoint: ["perfil_sharepoint", "perfil_acesso"],
  perfil_apps_internos: ["perfil_acesso", "efetivo"],
  cargo_perfis: ["cargos", "matriz", "efetivo"],
  cargos: ["cargos", "matriz"],
  areas: ["areas"],
  empresas: ["empresas"],
  localidades: ["localidades"],
  parametros: ["parametros", "modo_operacao"],
  eventos_jml: ["eventos_jml", "evento_jml", "dashboard_jml_tipo", "dashboard_kpis"],
  evento_jml_acoes: ["evento_jml_acoes", "evento_jml"],
  evento_jml_aprovacoes: ["evento_jml_aprovacoes", "evento_jml"],
  excecoes: ["excecoes", "dashboard_kpis"],
  revisoes: ["revisoes", "revisao", "dashboard_kpis"],
  revisao_itens: ["revisao_itens", "revisoes", "revisao"],
  licencas: ["licencas", "licencas_externas_uso"],
  entra_licencas: ["entra_licencas", "licencas"],
  entra_grupos: ["entra_grupos"],
  entra_roles: ["entra_roles", "privilegiados"],
  entra_role_members: ["entra_role_members", "privilegiados"],
  alertas: ["alertas", "dashboard_kpis", "notificacoes"],
  auditoria: ["auditoria", "dashboard_activity"],
  sync_jobs: ["sync_jobs_csv", "sync_jobs", "reconcile_job"],
  colab_quarentena: ["colab_quarentena"],
  iam_queue: [
    "iam_queue",
    "aprovacao_iam",
    "colab_individual_queue",
    "dashboard_kpis",
    "dashboard_queue_status",
    "dashboard_provisioning",
  ],
  solicitacoes_acesso: ["solicitacoes", "solicitacoes_acesso", "dashboard_kpis"],
  solicitacao_itens: ["solicitacoes", "solicitacao_itens", "solicitacoes_acesso"],
  workflow_fluxos: ["workflow_fluxos", "workflow"],
  workflow_etapas: ["workflow_etapas", "workflow", "workflow_fluxos"],
  workflow_execucoes: ["workflow_execucoes", "solicitacoes"],
  sod_conflitos: ["sod_conflitos", "sod"],
  regras: ["regras"],
  sharepoint_sites: ["sharepoint_sites"],
  sharepoint_pastas: ["sharepoint_pastas", "sharepoint_pastas_all"],
  profiles: ["profiles", "usuarios"],
  user_roles: ["user_roles", "usuarios", "role"],
};

export function useRealtimeSync() {
  const qc = useQueryClient();
  const pending = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const flush = () => {
      timer.current = null;
      const keys = Array.from(pending.current);
      pending.current.clear();
      keys.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
    };

    const schedule = (table: string) => {
      const keys = TABLE_QUERY_KEYS[table] ?? [table];
      keys.forEach((k) => pending.current.add(k));
      if (!timer.current) timer.current = setTimeout(flush, 600);
    };

    const channel = supabase.channel("origo-realtime-sync");
    Object.keys(TABLE_QUERY_KEYS).forEach((table) => {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        () => schedule(table),
      );
    });
    channel.subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
