// Triagem automática da quarentena do RH, disparada pelo Hermes (/run_task).
// Regras determinísticas no banco (quarentena_triagem); o que sobrar vira aviso no sino e no Telegram.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRoleOrService } from "../_shared/auth.ts";
import { notifyTelegram } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireRoleOrService(req, ["admin"]);
  if (auth instanceof Response) return auth;
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await supabase.rpc("quarentena_triagem");
    if (error) throw error;
    const r = data as { repeticoes: number; desligados: number; restantes: number };
    let telegram: unknown = null;
    if (r.restantes > 0) {
      const { data: open } = await supabase.from("alertas").select("id").eq("tipo", "quarentena_decisao").eq("lido", false).limit(1);
      if (!open?.length) {
        await supabase.from("alertas").insert({
          tipo: "quarentena_decisao", severidade: "aviso", titulo: "Quarentena do RH precisa de você",
          mensagem: `${r.restantes} pendência(s) que o Hermes não conseguiu decidir sozinho.`, ref_url: "/colaboradores/quarentena",
        });
        telegram = await notifyTelegram(supabase,
          `<b>Órigo IAM</b>\nO Hermes revisou a quarentena do RH: ${r.repeticoes} repetições descartadas, ${r.desligados} resolvidas.\n${r.restantes} precisam de decisão sua: https://iam.origoenergia.com.br/colaboradores/quarentena`);
      }
    }
    return new Response(JSON.stringify({ success: true, ...r, telegram }), { headers: corsHeaders });
  } catch (e) {
    console.error("[quarantine-triage]", e);
    return new Response(JSON.stringify({ success: false, error: String((e as Error)?.message ?? e) }), { status: 500, headers: corsHeaders });
  }
});
