// Ciclo diário do RH: baixa o CSV mais recente da pasta do SharePoint e importa.
// Toda a lógica de importação está em _shared/csvColabSync.ts (a mesma do upload
// manual). Site/pasta/prefixo são parâmetros (sharepoint_rh_site, sharepoint_rh_pasta,
// sharepoint_rh_prefixo) com os valores históricos como padrão.
//   POST {}                 → importa
//   POST { "dry_run": true } → pré-visualização (não grava)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireRoleOrService } from "../_shared/auth.ts";
import { getGraphToken, graphHeaders, GRAPH } from "../_shared/graph.ts";
import { processCsvColab } from "../_shared/csvColabSync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireRoleOrService(req, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dry_run === true || body?.dryRun === true;

  try {
    const { data: pRows } = await sb.from("parametros").select("chave, valor").in("chave", ["sharepoint_rh_site", "sharepoint_rh_pasta", "sharepoint_rh_prefixo"]);
    const P = new Map<string, string>((pRows || []).map((r: { chave: string; valor: string }) => [r.chave, r.valor]));
    const sitePath = P.get("sharepoint_rh_site") || "origoenergia.sharepoint.com:/sites/dataanalytics";
    const folder = (P.get("sharepoint_rh_pasta") || "RH_COLAB").replace(/^\/|\/$/g, "");
    const prefix = (P.get("sharepoint_rh_prefixo") || "base_colab_").toLowerCase();

    const token = await getGraphToken();
    const headers = graphHeaders(token);

    const siteRes = await fetch(`${GRAPH}/sites/${sitePath}`, { headers });
    if (!siteRes.ok) throw new Error(`Site SharePoint não resolvido (${siteRes.status}): ${sitePath}`);
    const siteId = (await siteRes.json()).id;

    const filesRes = await fetch(`${GRAPH}/sites/${siteId}/drive/root:/${folder}:/children?$orderby=lastModifiedDateTime desc&$top=200`, { headers });
    if (!filesRes.ok) throw new Error(`Falha ao listar a pasta ${folder} (${filesRes.status})`);
    const files = ((await filesRes.json()).value || [])
      .filter((f: any) => String(f.name || "").toLowerCase().startsWith(prefix) && String(f.name || "").toLowerCase().endsWith(".csv"))
      .sort((a: any, b: any) => new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime());
    if (files.length === 0) {
      return new Response(JSON.stringify({ error: `Nenhum CSV com prefixo ${prefix} em ${folder}` }), { status: 404, headers: corsHeaders });
    }
    const latest = files[0];

    let bytes: Uint8Array;
    if (latest["@microsoft.graph.downloadUrl"]) {
      const dl = await fetch(latest["@microsoft.graph.downloadUrl"]);
      if (!dl.ok) throw new Error(`Download falhou (${dl.status})`);
      bytes = new Uint8Array(await dl.arrayBuffer());
    } else {
      const dl = await fetch(`${GRAPH}/sites/${siteId}/drive/items/${latest.id}/content`, { headers });
      if (!dl.ok) throw new Error(`Download via content falhou (${dl.status})`);
      bytes = new Uint8Array(await dl.arrayBuffer());
    }
    const csvText = new TextDecoder("utf-8").decode(bytes);

    const result = await processCsvColab(sb, csvText, { source: "sharepoint", filename: latest.name, operador: auth.email, dryRun });
    return new Response(JSON.stringify({ ...result, file: latest.name, modified: latest.lastModifiedDateTime }), { status: 200, headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("sync-sharepoint-csv error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
