#!/usr/bin/env node
// Confere, com a chave anon (pública) do .env, se as RPCs desta versão existem em produção.
// "MISSING" = migration não aplicada; "ok" = existe (permissão negada para anon é esperado).
//   node scripts/check-prod-schema.mjs
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !ANON) { console.error("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY ausentes no .env"); process.exit(2); }

// [rpc, args, migration]
const CHECKS = [
  ["claim_iam_queue_items", { p_owner: "x", p_limit: 1, p_lease_seconds: 1, p_action_types: null }, "20260917120000"],
  ["iam_effective_access", { p_colaborador_id: "00000000-0000-0000-0000-000000000000", p_terceiro_id: null }, "20260917120100"],
  ["jml_alterar_status", { p_colaborador_id: "00000000-0000-0000-0000-000000000000", p_novo_status: "ativo", p_operador: "x" }, "20260917120200"],
  ["is_platform_admin", { _user_id: "00000000-0000-0000-0000-000000000000" }, "20260917120300"],
  ["iam_cron_invoke", { p_function: "x" }, "20260917120600"],
  ["iam_param", { p_chave: "x", p_default: "y" }, "20260917120700"],
  ["dashboard_metrics", {}, "20260918100000"],
  ["iam_queue_stats", {}, "20260918100000"],
  ["revisao_criar", { p_tipo: "x" }, "20260918120000"],
  ["hermes_inbox", {}, "20260918120000"],
  ["dashboard_activity", { p_limit: 1 }, "20260918130000"],
  ["revisao_criar_por_responsaveis", {}, "20260918130000"],
  ["admin_usuarios_resumo", {}, "20260918140000"],
];

let missing = 0;
for (const [fn, args, mig] of CHECKS) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const text = await res.text();
  let code = ""; try { code = JSON.parse(text).code || ""; } catch { /* corpo não JSON */ }
  const state = code === "PGRST202" ? "MISSING" : "ok";
  if (state === "MISSING") missing++;
  console.log(`${state.padEnd(7)} ${fn.padEnd(32)} (migration ${mig})`);
}
console.log(missing ? `\n${missing} RPC(s) ausentes → aplique as migrations pendentes (docs/deploy-producao.md).` : "\nSchema de produção atualizado.");
process.exit(missing ? 1 : 0);
