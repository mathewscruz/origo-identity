#!/usr/bin/env node
/**
 * Importa um export do banco de produção (Lovable Cloud) no Supabase LOCAL.
 *
 * Uso:
 *   node db/import-prod-dump.mjs <arquivo> [--reset] [--reset-passwords] [--keep-sql]
 *
 *   <arquivo>          .sql | .sql.gz | .dump/.backup (pg_dump custom) | .zip contendo um desses
 *   --reset            roda `supabase db reset` antes (schema limpo a partir das migrations + seed)
 *   --reset-passwords  após importar, define a senha "Origo@local123" para TODOS os usuários
 *                      importados (o export do Lovable não traz senhas utilizáveis)
 *   --keep-sql         mantém o SQL intermediário gerado em db/dumps/ (para inspeção)
 *
 * Estratégia: importação SOMENTE DE DADOS por cima do schema construído pelas
 * migrations (assim o schema local continua rastreável e versionado). Triggers e
 * FKs são desativados durante a carga (session_replication_role = replica).
 *
 * Schemas importados: public (todas as tabelas) e auth (users, identities).
 * Ignorados: supabase_migrations, storage.objects (arquivos não vêm no export),
 * auth.sessions/refresh_tokens/audit_log etc.
 */
import { spawnSync, spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, readFileSync, unlinkSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DUMPS_DIR = path.join(ROOT, "db", "dumps");
const CONTAINER = "supabase_db_jobopjhhxgcfanlhzlkc"; // project_id em supabase/config.toml
const AUTH_TABLES = new Set(["users", "identities"]);
const LOCAL_PASSWORD = "Origo@local123";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error("Uso: node db/import-prod-dump.mjs <arquivo> [--reset] [--reset-passwords] [--keep-sql]");
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`Arquivo não encontrado: ${file}`);
  process.exit(1);
}
mkdirSync(DUMPS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", shell: process.platform === "win32", ...opts });
  if (r.status !== 0) {
    console.error(`\n✖ Falhou: ${cmd} ${cmdArgs.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

function psql(sql) {
  const r = spawnSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], {
    input: sql,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(r.status ?? 1);
  }
  return r.stdout.trim();
}

function ensureLocalDbRunning() {
  const r = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", CONTAINER], { encoding: "utf8" });
  if (r.status !== 0 || r.stdout.trim() !== "true") {
    console.error(`✖ Container ${CONTAINER} não está rodando. Execute \`supabase start\` primeiro.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 1. Descobrir o formato do arquivo
// ---------------------------------------------------------------------------
function detectFormat(p) {
  const fd = readFileSync(p, { encoding: null, flag: "r" }).subarray(0, 5);
  if (fd.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))) return "gzip";
  if (fd.subarray(0, 2).equals(Buffer.from("PK"))) return "zip";
  if (fd.subarray(0, 5).equals(Buffer.from("PGDMP"))) return "custom";
  return "sql";
}

let inputPath = path.resolve(file);
let format = detectFormat(inputPath);
console.log(`→ Arquivo: ${inputPath} (${(statSync(inputPath).size / 1048576).toFixed(1)} MB, formato: ${format})`);

if (format === "zip") {
  const outDir = path.join(DUMPS_DIR, "unzipped");
  mkdirSync(outDir, { recursive: true });
  console.log("→ Extraindo zip…");
  run("tar", ["-xf", inputPath, "-C", outDir]); // tar no Windows 10+/Git Bash lê zip
  const candidates = spawnSync("find", [outDir, "-type", "f"], { encoding: "utf8", shell: true }).stdout
    .split(/\r?\n/).filter(Boolean)
    .filter((f) => /\.(sql|dump|backup|gz)$/i.test(f))
    .sort((a, b) => statSync(b).size - statSync(a).size);
  if (!candidates.length) {
    console.error("✖ Nenhum .sql/.dump encontrado dentro do zip.");
    process.exit(1);
  }
  inputPath = candidates[0];
  format = detectFormat(inputPath);
  console.log(`→ Usando ${inputPath} (formato: ${format})`);
}

ensureLocalDbRunning();

// ---------------------------------------------------------------------------
// 2. Reset opcional
// ---------------------------------------------------------------------------
if (flags.has("--reset")) {
  console.log("→ supabase db reset…");
  run("supabase", ["db", "reset"], { cwd: ROOT });
}

// ---------------------------------------------------------------------------
// 3. Importar
// ---------------------------------------------------------------------------
const before = psql(`SELECT count(*) FROM public.colaboradores`);
console.log(`→ colaboradores antes da importação: ${before}`);

// As migrations inserem dados de exemplo (colaboradores fictícios, parametros…)
// que colidiriam com as chaves de produção e abortariam blocos COPY inteiros.
// Limpa tudo em public + auth.users antes de carregar.
console.log("→ Limpando tabelas locais (public.* e auth.users)…");
const truncateList = psql(
  `SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename)
     FROM pg_tables WHERE schemaname = 'public'`
);
psql(`TRUNCATE ${truncateList}, auth.users CASCADE;`);

if (format === "custom") {
  // pg_restore data-only direto no container (o arquivo é copiado para /tmp)
  console.log("→ pg_restore (data-only, public + auth.users/identities)…");
  run("docker", ["cp", inputPath, `${CONTAINER}:/tmp/prod.dump`]);
  const common = ["exec", CONTAINER, "pg_restore", "-U", "supabase_admin", "-d", "postgres",
    "--data-only", "--disable-triggers", "--no-owner", "--no-privileges", "--exit-on-error=false"];
  // public inteiro, exceto supabase_migrations (que fica em outro schema, ok)
  spawnSync("docker", [...common, "--schema=public", "/tmp/prod.dump"], { stdio: "inherit" });
  spawnSync("docker", [...common, "--table=auth.users", "--table=auth.identities", "/tmp/prod.dump"], { stdio: "inherit" });
  spawnSync("docker", ["exec", CONTAINER, "rm", "-f", "/tmp/prod.dump"]);
} else {
  // SQL plano (gzip ou não): extrai apenas os blocos de dados (COPY ... FROM stdin / INSERT INTO)
  const outSql = path.join(DUMPS_DIR, `data-only-${Date.now()}.sql`);
  console.log(`→ Extraindo somente dados para ${outSql}…`);
  await extractDataOnly(inputPath, format === "gzip", outSql);

  console.log("→ Carregando no Postgres local (triggers/FKs desativados durante a carga)…");
  const r = spawnSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=0", "-q"], {
    input: readFileSync(outSql),
    stdio: ["pipe", "inherit", "inherit"],
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (r.status !== 0) console.warn("⚠ psql retornou erro em alguma statement (veja acima). Continuando…");
  if (!flags.has("--keep-sql")) unlinkSync(outSql);
}

// ---------------------------------------------------------------------------
// 4. Pós-importação
// ---------------------------------------------------------------------------
// Recria o admin local (admin@origo.local) — o seed é idempotente.
console.log("→ Reaplicando supabase/seed.sql (admin local)…");
psql(readFileSync(path.join(ROOT, "supabase", "seed.sql"), "utf8"));

if (flags.has("--reset-passwords")) {
  console.log(`→ Definindo senha "${LOCAL_PASSWORD}" para todos os usuários auth (somente local)…`);
  psql(`UPDATE auth.users SET encrypted_password = extensions.crypt('${LOCAL_PASSWORD}', extensions.gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()), banned_until = NULL, deleted_at = NULL;`);
}

const after = psql(`SELECT count(*) FROM public.colaboradores`);
const users = psql(`SELECT count(*) FROM auth.users`);
console.log(`\n✔ Importação concluída. colaboradores: ${before} → ${after} | auth.users: ${users}`);
console.log(`  Studio local: http://127.0.0.1:54423`);

// ---------------------------------------------------------------------------
async function extractDataOnly(src, gz, dest) {
  const out = createWriteStream(dest);
  out.write("SET session_replication_role = replica;\nSET client_min_messages = warning;\nSET search_path = public, extensions;\n\n");
  let stream = createReadStream(src);
  if (gz) stream = stream.pipe(createGunzip());
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let inCopy = false;
  let keepCopy = false;
  let copyCount = 0, insertCount = 0, skipped = new Set();

  const wanted = (schema, table) => {
    if (schema === "public") return table !== "schema_migrations";
    if (schema === "auth") return AUTH_TABLES.has(table);
    return false;
  };

  for await (const line of rl) {
    if (inCopy) {
      if (keepCopy) out.write(line + "\n");
      if (line === "\\.") { inCopy = false; keepCopy = false; }
      continue;
    }
    const m = line.match(/^COPY\s+"?([a-z_0-9]+)"?\."?([A-Za-z_0-9]+)"?\s/);
    if (m) {
      inCopy = true;
      keepCopy = wanted(m[1], m[2]);
      if (keepCopy) { copyCount++; out.write(line + "\n"); } else skipped.add(`${m[1]}.${m[2]}`);
      continue;
    }
    const ins = line.match(/^INSERT INTO\s+"?([a-z_0-9]+)"?\."?([A-Za-z_0-9]+)"?\s/);
    if (ins) {
      if (wanted(ins[1], ins[2])) { insertCount++; out.write(line.replace(/^INSERT INTO/, "INSERT INTO") + "\n"); }
      else skipped.add(`${ins[1]}.${ins[2]}`);
      continue;
    }
    // Algumas exportações trazem SELECT setval(...) para sequences: mantemos para public
    if (/^SELECT pg_catalog\.setval\('public\./.test(line)) out.write(line + "\n");
  }
  out.write("\nSET session_replication_role = DEFAULT;\n");
  await new Promise((res) => out.end(res));
  console.log(`   blocos COPY: ${copyCount} | INSERTs: ${insertCount} | tabelas ignoradas: ${[...skipped].filter((t) => !t.startsWith("public.")).length} fora de public/auth`);
}
