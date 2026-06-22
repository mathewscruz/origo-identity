import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendEmail } from "../_shared/sendgrid.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * auto-recertification: Checks applications that haven't been reviewed
 * in the configured period and auto-creates review campaigns.
 * 
 * Also checks for expired third-party contracts and deactivates them.
 * 
 * Triggered manually or via pg_cron.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const results = {
    revisoes_criadas: 0,
    terceiros_expirados: 0,
    terceiros_revalidados: 0,
    errors: [] as string[],
  };

  try {
    // ─── PART 1: Auto-Recertification ───

    // Get configured period (default 90 days)
    const { data: param } = await sb
      .from("parametros")
      .select("valor")
      .eq("chave", "revisao_periodicidade_dias")
      .single();
    
    const periodDays = parseInt(param?.valor || "90") || 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    const cutoffISO = cutoff.toISOString();

    // Get all applications with owners
    const { data: apps } = await sb
      .from("aplicacoes")
      .select("id, nome, owner")
      .not("owner", "is", null);

    if (apps && apps.length > 0) {
      for (const app of apps) {
        // Check if there's a recent review for this app
        const { data: recentReview } = await sb
          .from("revisoes")
          .select("id, created_at")
          .ilike("nome", `%${app.nome}%`)
          .gte("created_at", cutoffISO)
          .limit(1);

        if (recentReview && recentReview.length > 0) continue; // Already has recent review

        // Get collaborators with active access to profiles linked to this app
        const { data: perfilApps } = await sb
          .from("perfil_aplicacoes")
          .select("perfil_id")
          .eq("aplicacao_id", app.id);

        if (!perfilApps || perfilApps.length === 0) continue;

        const perfilIds = perfilApps.map((pa: any) => pa.perfil_id);

        const { data: atribuicoes } = await sb
          .from("perfil_atribuicoes")
          .select("colaborador_id, perfil_id")
          .eq("ativo", true)
          .in("perfil_id", perfilIds);

        if (!atribuicoes || atribuicoes.length === 0) continue;

        // Get colaborador names
        const colabIds = [...new Set(atribuicoes.map((a: any) => a.colaborador_id).filter(Boolean))];
        const colabMap = new Map<string, string>();
        for (let i = 0; i < colabIds.length; i += 50) {
          const { data: colabs } = await sb
            .from("colaboradores")
            .select("id, nome")
            .in("id", colabIds.slice(i, i + 50));
          colabs?.forEach((c: any) => colabMap.set(c.id, c.nome));
        }

        // Get perfil names
        const perfilMap = new Map<string, string>();
        const { data: perfisData } = await sb
          .from("perfis_acesso")
          .select("id, nome")
          .in("id", perfilIds);
        perfisData?.forEach((p: any) => perfilMap.set(p.id, p.nome));

        // Create review
        const hoje = new Date().toISOString().split("T")[0];
        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() + 14); // 14 days to complete

        const token = crypto.randomUUID();

        // Resolve owner email from colaboradores
        let ownerEmail: string | null = null;
        if (app.owner) {
          const { data: ownerColab } = await sb
            .from("colaboradores")
            .select("email")
            .eq("id", app.owner)
            .single();
          ownerEmail = ownerColab?.email || null;
        }

        const { data: revisao, error: revError } = await sb
          .from("revisoes")
          .insert({
            nome: `Recertificação — ${app.nome}`,
            descricao: `Revisão automática de acessos à aplicação ${app.nome}. Período: ${periodDays} dias.`,
            responsavel: app.owner,
            status: "em_andamento",
            data_inicio: hoje,
            data_fim: dataLimite.toISOString().split("T")[0],
            total_itens: atribuicoes.length,
            itens_revisados: 0,
            token,
            aplicacao_id: app.id,
            owner_email: ownerEmail,
            tipo: "aplicacao",
          })
          .select("id")
          .single();

        if (revError) {
          results.errors.push(`Erro ao criar revisão para ${app.nome}: ${revError.message}`);
          continue;
        }

        // Create review items
        const itens = atribuicoes.map((a: any) => ({
          revisao_id: revisao.id,
          colaborador_id: a.colaborador_id,
          colaborador_nome: colabMap.get(a.colaborador_id) || "—",
          perfil_id: a.perfil_id,
          perfil_nome: perfilMap.get(a.perfil_id) || "—",
        }));

        const { error: itensError } = await sb.from("revisao_itens").insert(itens);
        if (itensError) {
          results.errors.push(`Erro ao criar itens para ${app.nome}: ${itensError.message}`);
        }

        // Create alert
        await sb.from("alertas").insert({
          titulo: `Recertificação automática criada: ${app.nome}`,
          mensagem: `${atribuicoes.length} acessos para revisar. Prazo: ${dataLimite.toLocaleDateString("pt-BR")}.`,
          severidade: "info",
          tipo: "recertificacao",
          ref_url: `/revisoes/${revisao.id}`,
          ref_id: revisao.id,
          ref_tipo: "revisao",
        });

        // Send review email to owner
        if (ownerEmail) {
          try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/send-review-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SERVICE_KEY}`,
              },
              body: JSON.stringify({ revisao_id: revisao.id }),
            });
            if (!response.ok) {
              console.error(`Failed to send review email for ${app.nome}:`, await response.text());
            }
          } catch (emailErr) {
            console.error(`Error sending review email for ${app.nome}:`, emailErr);
          }
        }

        results.revisoes_criadas++;
        console.log(`Auto-recertification created for ${app.nome}: ${atribuicoes.length} items`);
      }
    }

    // ─── PART 2: Third-party Expiration ───

    const hoje = new Date().toISOString().split("T")[0];
    const { data: terceirosExpirados } = await sb
      .from("terceiros")
      .select("id, nome, email, contrato_fim, responsavel, responsavel_colaborador_id")
      .eq("ativo", true)
      .not("contrato_fim", "is", null)
      .lte("contrato_fim", hoje);

    // Helper: resolve responsavel email (FK colaborador → responsavel text → terceiro.email)
    const resolveResponsavelEmail = async (t: any): Promise<string | null> => {
      if (t.responsavel_colaborador_id) {
        const { data: c } = await sb.from("colaboradores").select("email").eq("id", t.responsavel_colaborador_id).single();
        if (c?.email) return c.email;
      }
      if (t.responsavel && typeof t.responsavel === "string") {
        const match = t.responsavel.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
        if (match) return match[0];
      }
      return t.email || null;
    };

    if (terceirosExpirados && terceirosExpirados.length > 0) {
      for (const terceiro of terceirosExpirados) {
        // Deactivate
        await sb.from("terceiros").update({ ativo: false }).eq("id", terceiro.id);

        // Revoke all active access
        await sb
          .from("perfil_atribuicoes")
          .update({ ativo: false, data_revogacao: new Date().toISOString() })
          .eq("terceiro_id", terceiro.id)
          .eq("ativo", true);

        // Create JML leaver event
        await sb.from("eventos_jml").insert({
          tipo: "leaver",
          colaborador_nome: terceiro.nome,
          status: "executado",
          origem: "auto_expiracao",
          dados_antes: { nome: terceiro.nome, email: terceiro.email, contrato_fim: terceiro.contrato_fim },
          dados_depois: { ativo: false },
        });

        // Create alert
        await sb.from("alertas").insert({
          titulo: `Terceiro expirado: ${terceiro.nome}`,
          mensagem: `Contrato encerrado em ${terceiro.contrato_fim}. Acessos revogados automaticamente.`,
          severidade: "aviso",
          tipo: "terceiro_expirado",
          ref_url: `/terceiros/${terceiro.id}`,
          ref_id: terceiro.id,
          ref_tipo: "terceiro",
        });

        // Audit
        await sb.from("auditoria").insert({
          entidade: "terceiro",
          acao: "expirar",
          entidade_id: terceiro.id,
          resumo: `Terceiro ${terceiro.nome} expirado automaticamente. Acessos revogados.`,
          operador: "sistema",
        });

        // Send email to responsavel (resolved via FK)
        const responsavelEmail = await resolveResponsavelEmail(terceiro);
        if (responsavelEmail) {
          await sendEmail({
            to: responsavelEmail,
            subject: `Contrato expirado — ${terceiro.nome}`,
            htmlContent: `<p>O contrato do terceiro <strong>${terceiro.nome}</strong> expirou em ${terceiro.contrato_fim}. Todos os acessos foram revogados automaticamente.</p>`,
          });
        }

        results.terceiros_expirados++;
        console.log(`Third-party expired: ${terceiro.nome}`);
      }
    }

    // ─── PART 3: Third-party 45-day Revalidation ───

    const { data: terceirosAtivos } = await sb
      .from("terceiros")
      .select("id, nome, email, responsavel, responsavel_colaborador_id, contrato_inicio, contrato_fim, ultima_revalidacao")
      .eq("ativo", true)
      .not("contrato_fim", "is", null);

    if (terceirosAtivos && terceirosAtivos.length > 0) {
      const todayDate = new Date();
      for (const t of terceirosAtivos) {
        // Skip if contract already expired (handled by PART 2)
        if (t.contrato_fim && new Date(t.contrato_fim) <= todayDate) continue;

        const baseDate = t.ultima_revalidacao ? new Date(t.ultima_revalidacao) : (t.contrato_inicio ? new Date(t.contrato_inicio) : null);
        if (!baseDate) continue;

        const daysSinceBase = Math.floor((todayDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceBase < 45) continue;

        // 45 days have passed — create alert for responsible
        await sb.from("alertas").insert({
          titulo: `Revalidação de terceiro: ${t.nome}`,
          mensagem: `O terceiro ${t.nome} precisa ser revalidado. O responsável (${t.responsavel || "não definido"}) deve decidir se mantém ou revoga o acesso.`,
          severidade: "aviso",
          tipo: "revalidacao_terceiro",
          ref_url: `/terceiros/${t.id}`,
          ref_id: t.id,
          ref_tipo: "terceiro",
        });

        // Update ultima_revalidacao to today to avoid re-triggering
        await sb.from("terceiros").update({ ultima_revalidacao: todayDate.toISOString().split("T")[0] }).eq("id", t.id);

        // Audit
        await sb.from("auditoria").insert({
          entidade: "terceiro",
          acao: "revalidacao_45dias",
          entidade_id: t.id,
          resumo: `Revalidação de 45 dias disparada para terceiro ${t.nome}. Responsável: ${t.responsavel || "—"}.`,
          operador: "sistema",
        });

        // Send email to responsavel
        if (t.responsavel && t.responsavel.includes("@")) {
          await sendEmail({
            to: t.responsavel,
            subject: `Revalidação necessária — ${t.nome}`,
            htmlContent: `<p>O terceiro <strong>${t.nome}</strong> precisa ser revalidado (45 dias desde última validação). Por favor, avalie se o acesso deve ser mantido ou revogado.</p>`,
          });
        }

        results.terceiros_revalidados++;
        console.log(`45-day revalidation triggered for ${t.nome}`);
      }
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("auto-recertification error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
