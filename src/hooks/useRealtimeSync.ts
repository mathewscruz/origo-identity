import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tempo real em todas as telas: uma única assinatura Postgres Changes (schema
 * inteiro) invalida o cache do react-query. Todo número exibido vem de um
 * `useQuery`, então nada precisa de refresh manual.
 *
 * Convenção de chaves: o primeiro elemento da queryKey começa com o nome da
 * tabela (ex.: "colaboradores", "colaborador", "iam_queue_page") ou com um dos
 * prefixos derivados abaixo. Tabela sem mapeamento ⇒ invalida tudo (rede de
 * segurança), então esquecer uma chave nunca deixa a tela desatualizada.
 */
const TABLE_KEY_PREFIXES: Record<string, string[]> = {
  colaboradores: ["colaborador", "dashboard", "reconcile", "aplicacao", "effective_access", "all-colaboradores", "iam-colabs", "resource_name", "relatorio", "sod"],
  terceiros: ["terceiro", "dashboard", "effective_access", "relatorio"],
  aplicacoes: ["aplicacao", "aplicacoes", "dashboard", "resource_name", "connector", "licenca", "relatorio"],
  aplicacao_connectors: ["aplicacao", "connector"],
  aplicacao_perfis_internos: ["aplicacao", "perfil_acesso", "all_perfis_internos"],
  perfis_acesso: ["perfis_acesso", "perfil_acesso", "perfil_", "dashboard", "cargo", "resource_name", "sod", "relatorio", "excecoes"],
  perfil_atribuicoes: ["perfil_atribuicoes", "perfil_", "colab_individual_queue", "effective_access", "terceiro_atribuicoes", "aplicacao", "dashboard", "sod", "relatorio", "colaborador", "terceiro"],
  perfil_grupos: ["perfil_", "perfis_acesso", "effective_access", "aplicacao"],
  perfil_licencas: ["perfil_", "perfis_acesso", "effective_access"],
  perfil_aplicacoes: ["perfil_", "perfis_acesso", "effective_access", "aplicacao"],
  perfil_sharepoint: ["perfil_", "perfis_acesso", "effective_access"],
  perfil_apps_internos: ["perfil_", "perfis_acesso", "effective_access"],
  cargo_perfis: ["cargo", "effective_access", "perfil_"],
  cargos: ["cargo", "colaborador", "resource_name"],
  areas: ["areas", "colaborador"],
  empresas: ["empresas", "localidades", "areas", "colaborador"],
  localidades: ["localidades", "colaborador"],
  parametros: ["parametros", "iam-approval-mode", "licencas", "dashboard"],
  eventos_jml: ["eventos_jml", "evento_jml", "evento_queue", "dashboard", "reconcile", "colaborador", "terceiro"],
  excecoes: ["excecoes", "dashboard", "colaborador"],
  revisoes: ["revisoes", "revisao", "dashboard"],
  revisao_itens: ["revisao", "revisoes", "dashboard"],
  licencas: ["licencas", "licenca"],
  entra_licencas: ["entra_licencas", "licencas", "licenca", "resource_name", "dashboard"],
  entra_grupos: ["entra_grupos", "resource_name", "aplicacao"],
  entra_roles: ["entra-roles", "entra_roles", "privilegiados", "dashboard"],
  entra_role_members: ["entra-role", "entra_role", "privilegiados", "colaborador", "dashboard"],
  contas_admin_conhecidas: ["contas", "privilegiados"],
  alertas: ["alertas", "dashboard", "notificacoes"],
  auditoria: ["auditoria", "dashboard_activity", "colaborador_atividade"],
  sync_jobs: ["sync_jobs", "reconcile", "dashboard"],
  iam_queue: ["iam_queue", "iam-", "aprovacao_iam", "colab_individual_queue", "dashboard", "evento_queue", "effective_access", "aplicacao", "colaborador", "terceiro", "licencas_externas_uso", "relatorio", "reconcile"],
  iam_agent_status: ["iam_agent", "dashboard"],
  sod_conflitos: ["sod", "dashboard"],
  colab_quarentena: ["colab_quarentena", "sync_jobs", "dashboard"],
  sharepoint_sites: ["sharepoint", "resource_name"],
  sharepoint_pastas: ["sharepoint", "resource_name"],
  profiles: ["profiles", "usuarios", "admin_profiles"],
  user_roles: ["user_roles", "usuarios", "admin_profiles", "role"],
};

const DB_CHANGE_EVENT = "origo:db-change";

/**
 * Para telas que ainda carregam dados com fetch próprio (fora do react-query):
 * chama `cb` quando qualquer das tabelas mudar (debounced pelo useRealtimeSync).
 */
export function useDbChange(tables: string[], cb: () => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const key = tables.join(",");
  useEffect(() => {
    const handler = (e: Event) => {
      const changed = (e as CustomEvent<{ tables: string[]; all: boolean }>).detail;
      if (changed.all || changed.tables.some((t) => key.split(",").includes(t))) cbRef.current();
    };
    window.addEventListener(DB_CHANGE_EVENT, handler);
    return () => window.removeEventListener(DB_CHANGE_EVENT, handler);
  }, [key]);
}

export function useRealtimeSync() {
  const qc = useQueryClient();
  const pending = useRef<Set<string>>(new Set());
  const tables = useRef<Set<string>>(new Set());
  const invalidateAll = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const flush = () => {
      timer.current = null;
      const prefixes = Array.from(pending.current);
      const changedTables = Array.from(tables.current);
      pending.current.clear();
      tables.current.clear();
      window.dispatchEvent(new CustomEvent(DB_CHANGE_EVENT, { detail: { tables: changedTables, all: invalidateAll.current } }));
      if (invalidateAll.current) {
        invalidateAll.current = false;
        qc.invalidateQueries();
        return;
      }
      qc.invalidateQueries({
        predicate: (q) => {
          const head = String(q.queryKey[0] ?? "");
          return prefixes.some((p) => head === p || head.startsWith(p));
        },
      });
    };

    const schedule = (table?: string) => {
      const prefixes = table ? TABLE_KEY_PREFIXES[table] : undefined;
      if (table) tables.current.add(table);
      if (prefixes) {
        prefixes.forEach((p) => pending.current.add(p));
        if (table) pending.current.add(table);
      } else {
        invalidateAll.current = true;
      }
      // agrupa rajadas (o agente processa vários itens em sequência)
      if (!timer.current) timer.current = setTimeout(flush, 500);
    };

    const channel = supabase
      .channel("origo-realtime-sync")
      .on("postgres_changes" as never, { event: "*", schema: "public" }, (payload: { table?: string }) => schedule(payload?.table));
    channel.subscribe();

    // rede de segurança para eventos perdidos (aba em segundo plano, reconexão)
    const onVisible = () => { if (document.visibilityState === "visible") qc.invalidateQueries(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
