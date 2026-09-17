#!/usr/bin/env node
// Gera db/deploy/migrations-pendentes.sql: todas as migrations a partir de uma versão,
// concatenadas em ordem, para colar no SQL editor do Lovable Cloud quando o sync do
// GitHub não aplica migrations. No fim registra as versões em
// supabase_migrations.schema_migrations para o Lovable não reaplicar.
//
//   node scripts/build-deploy-sql.mjs [versao_minima]   (padrão: 20260806141300)
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, "supabase/migrations");
const minVersion = process.argv[2] || "20260806141300";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= minVersion).sort();

// as migrations anteriores a 20260917 já estão em produção; só a de reconstrução (no-op lá) e as novas
const wanted = files.filter((f) => f.startsWith("20260806141300") || f.slice(0, 14) >= "20260917120000");

let out = `-- =============================================================================
-- Órigo Access & Identity — migrations pendentes para produção (gerado por scripts/build-deploy-sql.mjs)
-- Gerado em ${new Date().toISOString()} — ${wanted.length} arquivo(s)
-- Todas são idempotentes: podem ser reaplicadas em caso de falha parcial.
-- Cole no SQL editor do Lovable Cloud e execute de uma vez.
-- =============================================================================
`;
const versions = [];
for (const f of wanted) {
  const sql = readFileSync(resolve(dir, f), "utf8");
  const version = f.slice(0, 14);
  const name = f.slice(15).replace(/\.sql$/, "");
  versions.push([version, name]);
  out += `\n\n-- >>>>>>>>>>>>>>>>>>>>>> ${f} >>>>>>>>>>>>>>>>>>>>>>\n${sql.trim()}\n-- <<<<<<<<<<<<<<<<<<<<<< ${f} <<<<<<<<<<<<<<<<<<<<<<\n`;
}
out += `\n\n-- registra as versões para o Lovable/CLI não reaplicarem\nCREATE SCHEMA IF NOT EXISTS supabase_migrations;\nCREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);\n`;
for (const [v, n] of versions) out += `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${v}', '${n}') ON CONFLICT (version) DO NOTHING;\n`;
out += `NOTIFY pgrst, 'reload schema';\n`;

mkdirSync(resolve(root, "db/deploy"), { recursive: true });
const outFile = resolve(root, "db/deploy/migrations-pendentes.sql");
writeFileSync(outFile, out);
console.log(`ok: ${outFile} (${wanted.length} migrations, ${out.split("\n").length} linhas)`);
for (const [v, n] of versions) console.log(`  ${v} ${n}`);
