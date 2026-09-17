// Importação MANUAL da base do RH (upload de CSV pela tela de integrações).
// Toda a lógica está em _shared/csvColabSync.ts — a mesma do ciclo diário.
//   POST multipart/form-data { file }  ou  POST text/csv
//   ?dry_run=1  → pré-visualização (classifica e reporta, não grava)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireRoleOrService } from "../_shared/auth.ts";
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
  const url = new URL(req.url);
  const dryRun = ["1", "true"].includes(url.searchParams.get("dry_run") || "");

  try {
    const contentType = req.headers.get("content-type") || "";
    let csvText = "";
    let filename = "upload_manual.csv";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) throw new Error("Nenhum arquivo CSV enviado");
      csvText = await file.text();
      filename = file.name || filename;
    } else {
      csvText = await req.text();
    }
    if (!csvText.trim()) throw new Error("CSV vazio");

    const result = await processCsvColab(sb, csvText, { source: "upload", filename, operador: auth.email, dryRun });
    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("sync-csv-colab error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
