import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CsvRow {
  [key: string]: string;
}

const REQUIRED_HEADERS = [
  "displayName",
  "employID",
  "mail",
  "company",
  "title",
  "status",
  "Data_Admissao",
  "Cadastro_Pessoa_Fisica",
  "Base_Local",
];

const STATUS_MAP: Record<string, string> = {
  ativo: "ativo",
  demitido: "desligado",
  desligado: "desligado",
  afastado: "afastado",
  "férias": "ferias",
  ferias: "ferias",
  inativo: "inativo",
  suspenso: "afastado",
  licenca: "afastado",
  "licença": "afastado",
  aposentado: "desligado",
  transferido: "ativo",
};

function normalizeHeader(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g, " ").trim();
}

function findHeaderMatch(headers: string[], target: string): string | null {
  const normTarget = normalizeHeader(target);
  const exact = headers.find((h) => h === target);
  if (exact) return exact;
  const norm = headers.find((h) => normalizeHeader(h) === normTarget);
  if (norm) return norm;
  const contains = headers.find((h) => normalizeHeader(h).includes(normTarget));
  if (contains) return contains;
  return null;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) { fields.push(current.trim()); current = ""; }
      else current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function detectDelimiter(headerLine: string): string {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

function parseCsv(text: string): CsvRow[] {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV vazio ou sem dados");

  const delimiter = detectDelimiter(lines[0]);
  console.log(`Detected delimiter: "${delimiter}"`);

  const rawHeaders = splitCsvLine(lines[0], delimiter);
  console.log(`Headers (${rawHeaders.length}): ${rawHeaders.slice(0, 10).join(", ")}`);

  const headerMap: Record<string, string> = {};
  const missing: string[] = [];
  for (const req of REQUIRED_HEADERS) {
    const match = findHeaderMatch(rawHeaders, req);
    if (match) headerMap[req] = match;
    else missing.push(req);
  }
  if (missing.length > 0) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}`);

  const reverseMap: Record<string, string> = {};
  for (const [stdName, actualName] of Object.entries(headerMap)) {
    reverseMap[actualName] = stdName;
  }

  const rows: CsvRow[] = [];
  let syntheticCount = 0;
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i], delimiter);
    if (values.length < rawHeaders.length * 0.5) continue;
    const row: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => {
      row[h] = values[idx] || "";
      if (reverseMap[h]) row[reverseMap[h]] = values[idx] || "";
    });
    if (!(row["employID"] || "").trim()) {
      const key = [row["displayName"] || "", row["mail"] || "", row["Cadastro_Pessoa_Fisica"] || ""].join("|");
      const encoder = new TextEncoder();
      const data = encoder.encode(key);
      let hash = 0;
      for (const b of data) { hash = ((hash << 5) - hash + b) | 0; }
      const shortHash = Math.abs(hash).toString(36).padStart(6, "0").slice(0, 8);
      row["employID"] = `SEM_MAT_${shortHash}`;
      row["__synthetic_matricula"] = "true";
      syntheticCount++;
    }
    rows.push(row);
  }
  console.log(`Parsed ${rows.length} rows (${syntheticCount} without original matricula)`);
  return rows;
}

function parseDate(d: string): string | null {
  if (!d || d === "NULL" || d === "") return null;
  const parts = d.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

const PLACEHOLDER_EMPRESA_ID = "00000000-0000-0000-0000-000000000000";

async function processCsvData(sb: any, csvText: string, filename: string) {
  // ── 1. Create sync_job ──
  const { data: job, error: jobErr } = await sb
    .from("sync_jobs")
    .insert({ status: "running", tipo: "csv_colab", message: "Iniciando importação CSV...", phase: "parsing", filename })
    .select().single();
  if (jobErr) throw jobErr;
  const jobId = job.id;

  try {
    // ── 2. Parse CSV — ALL rows, NO deduplication ──
    const rows = parseCsv(csvText);
    const totalRows = rows.length;

    await sb.from("sync_jobs").update({ message: `Parsed ${totalRows} registros. Processando...`, phase: "preparing", colab_total: totalRows }).eq("id", jobId);

    // ── 3. Count existing CSV-origin records for JML comparison ──
    const existingMatriculas = new Set<string>();
    let from = 0;
    const PAGE = 1000;
    const existingIds: string[] = [];
    while (true) {
      const { data } = await sb
        .from("colaboradores")
        .select("id, matricula, nome, email, status")
        .eq("origem", "csv")
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      data.forEach((c: any) => {
        existingIds.push(c.id);
        if (c.matricula) existingMatriculas.add(c.matricula);
      });
      if (data.length < PAGE) break;
      from += PAGE;
    }
    const existingCount = existingIds.length;
    console.log(`Existing CSV colaboradores: ${existingCount}`);

    // ── 4. Collect CSV matriculas for JML events ──
    const csvMatriculas = new Set<string>();
    let syntheticMatCount = 0;
    for (const row of rows) {
      const mat = row.employID?.trim();
      if (mat) csvMatriculas.add(mat);
      if (row["__synthetic_matricula"] === "true") syntheticMatCount++;
    }

    // Leavers: matriculas that existed but are not in CSV anymore
    const leaverMatriculas: string[] = [];
    for (const mat of existingMatriculas) {
      if (!csvMatriculas.has(mat)) leaverMatriculas.push(mat);
    }
    // Joiners: matriculas in CSV that didn't exist before
    const joinerMatriculas = new Set<string>();
    for (const mat of csvMatriculas) {
      if (!existingMatriculas.has(mat)) joinerMatriculas.add(mat);
    }
    console.log(`JML preview: ${joinerMatriculas.size} joiners, ${leaverMatriculas.length} leavers`);

    // ── 5. Resolve lookup entities ──
    await sb.from("sync_jobs").update({ phase: "lookups", message: "Resolvendo entidades auxiliares...", colab_percent: 10 }).eq("id", jobId);

    const empresaCache = new Map<string, string>();
    const cargoCache = new Map<string, string>();
    const areaCache = new Map<string, string>();
    const localCache = new Map<string, string>();

    const [empresas, cargosData, areasData, locaisData] = await Promise.all([
      sb.from("empresas").select("id, nome"),
      sb.from("cargos").select("id, nome"),
      sb.from("areas").select("id, nome, empresa_id"),
      sb.from("localidades").select("id, nome, empresa_id"),
    ]);
    (empresas.data || []).forEach((e: any) => empresaCache.set(e.nome.toLowerCase(), e.id));
    (cargosData.data || []).forEach((c: any) => cargoCache.set(c.nome.toLowerCase(), c.id));
    (areasData.data || []).forEach((a: any) => areaCache.set(a.nome.toLowerCase(), a.id));
    (locaisData.data || []).forEach((l: any) => localCache.set(l.nome.toLowerCase(), l.id));

    const missingEmpresas = new Set<string>();
    const missingCargos = new Set<string>();
    const missingAreas = new Set<string>();
    const missingLocais = new Set<string>();

    for (const row of rows) {
      const company = row.company?.trim();
      if (company && company !== "NULL" && !empresaCache.has(company.toLowerCase())) missingEmpresas.add(company);
      const cargo = (row.description || row.title || "").trim();
      if (cargo && cargo !== "NULL" && !cargoCache.has(cargo.toLowerCase())) missingCargos.add(cargo);
      const area = row.departmentNumber?.trim();
      if (area && area !== "NULL" && !areaCache.has(area.toLowerCase())) missingAreas.add(area);
      const local = row.Base_Local?.trim();
      if (local && local !== "NULL" && !localCache.has(local.toLowerCase())) missingLocais.add(local);
    }

    if (missingEmpresas.size > 0) {
      for (const batch of chunk(Array.from(missingEmpresas).map(nome => ({ nome })), 200)) {
        await sb.from("empresas").upsert(batch, { onConflict: "nome", ignoreDuplicates: true });
      }
      const { data: allEmp } = await sb.from("empresas").select("id, nome");
      if (allEmp) allEmp.forEach((e: any) => empresaCache.set(e.nome.toLowerCase(), e.id));
    }
    if (missingCargos.size > 0) {
      for (const batch of chunk(Array.from(missingCargos).map(nome => ({ nome })), 200)) {
        await sb.from("cargos").upsert(batch, { onConflict: "nome", ignoreDuplicates: true });
      }
      const { data: allCargos } = await sb.from("cargos").select("id, nome");
      if (allCargos) allCargos.forEach((c: any) => cargoCache.set(c.nome.toLowerCase(), c.id));
    }
    if (missingAreas.size > 0) {
      for (const batch of chunk(Array.from(missingAreas).map(nome => ({ nome, empresa_id: PLACEHOLDER_EMPRESA_ID })), 200)) {
        await sb.from("areas").insert(batch);
      }
      const { data: allAreas } = await sb.from("areas").select("id, nome");
      if (allAreas) allAreas.forEach((a: any) => areaCache.set(a.nome.toLowerCase(), a.id));
    }
    if (missingLocais.size > 0) {
      for (const batch of chunk(Array.from(missingLocais).map(nome => ({ nome, empresa_id: PLACEHOLDER_EMPRESA_ID })), 200)) {
        await sb.from("localidades").insert(batch);
      }
      const { data: allLocais } = await sb.from("localidades").select("id, nome");
      if (allLocais) allLocais.forEach((l: any) => localCache.set(l.nome.toLowerCase(), l.id));
    }

    console.log(`Lookups ready: ${empresaCache.size} empresas, ${cargoCache.size} cargos, ${areaCache.size} areas, ${localCache.size} locais`);

    function buildColabData(row: CsvRow) {
      const statusMapped = STATUS_MAP[(row.status || "ativo").toLowerCase()] || "ativo";
      return {
        nome: row.displayName,
        email: row.mail || null,
        matricula: row.employID.trim(),
        cpf: row.Cadastro_Pessoa_Fisica || null,
        empresa_id: empresaCache.get((row.company || "").toLowerCase()) || null,
        cargo_id: cargoCache.get(((row.description || row.title || "").trim()).toLowerCase()) || null,
        area_id: areaCache.get((row.departmentNumber || "").toLowerCase()) || null,
        localidade_id: localCache.get((row.Base_Local || "").toLowerCase()) || null,
        status: statusMapped,
        data_admissao: parseDate(row.Data_Admissao),
        data_desligamento: parseDate(row.Data_Rescisao),
        origem: "csv",
        ultima_importacao_id: jobId,
      };
    }

    // ── 6. DELETE all existing CSV-origin records ──
    await sb.from("sync_jobs").update({ phase: "deleting", message: `Removendo ${existingCount} registros antigos...`, colab_percent: 20 }).eq("id", jobId);

    let deletedCount = 0;
    for (const batch of chunk(existingIds, 200)) {
      const { error } = await sb.from("colaboradores").delete().in("id", batch);
      if (!error) deletedCount += batch.length;
      else console.error("Delete batch error:", error.message);
    }
    console.log(`Deleted ${deletedCount} existing CSV colaboradores`);

    // ── 7. INSERT all CSV rows (no dedup) ──
    await sb.from("sync_jobs").update({ phase: "inserting", message: `Inserindo ${totalRows} colaboradores...`, colab_percent: 30 }).eq("id", jobId);

    let created = 0;
    const insertChunks = chunk(rows, 500);
    for (let ci = 0; ci < insertChunks.length; ci++) {
      const batch = insertChunks[ci];
      const insertData = batch.map(row => buildColabData(row));
      const { data: inserted, error: insErr } = await sb.from("colaboradores").insert(insertData).select("id");
      if (insErr) { console.error("Insert batch error:", insErr.message); continue; }
      if (inserted) created += inserted.length;
      const pct = 30 + Math.round((ci + 1) / insertChunks.length * 50);
      await sb.from("sync_jobs").update({ colab_percent: pct, colab_created: created, message: `Inseridos ${created}/${totalRows}...` }).eq("id", jobId);
    }

    // ── 8. Register JML events ──
    await sb.from("sync_jobs").update({ phase: "events", message: "Registrando eventos JML...", colab_percent: 85 }).eq("id", jobId);

    // Leaver events (matriculas that disappeared)
    if (leaverMatriculas.length > 0) {
      const leaverEvents = leaverMatriculas.map(mat => ({
        tipo: "leaver",
        colaborador_nome: mat,
        status: "executado",
        origem: "importacao_csv",
        dados_antes: { matricula: mat },
      }));
      for (const batch of chunk(leaverEvents, 200)) await sb.from("eventos_jml").insert(batch);
    }

    // Joiner events (new matriculas)
    if (joinerMatriculas.size > 0) {
      const joinerEvents = Array.from(joinerMatriculas).map(mat => ({
        tipo: "joiner",
        colaborador_nome: mat,
        status: "pendente",
        origem: "importacao_csv",
        dados_depois: { matricula: mat },
      }));
      for (const batch of chunk(joinerEvents, 200)) await sb.from("eventos_jml").insert(batch);
    }

    // ── 9. Alert if leavers ──
    if (leaverMatriculas.length > 0) {
      await sb.from("alertas").insert({
        tipo: "remocao_csv",
        titulo: `${leaverMatriculas.length} colaborador(es) removido(s)`,
        mensagem: `Importação CSV removeu ${leaverMatriculas.length} colaborador(es) ausentes do arquivo.`,
        severidade: "info", ref_tipo: "sync_job", ref_id: jobId,
      });
    }

    // ── 10. Finalize ──
    const syntheticMsg = syntheticMatCount > 0 ? `, ${syntheticMatCount} sem matrícula original` : "";
    const removedMsg = leaverMatriculas.length > 0 ? `, ${leaverMatriculas.length} removidos` : "";
    const newMsg = joinerMatriculas.size > 0 ? `, ${joinerMatriculas.size} novos` : "";
    await sb.from("sync_jobs").update({
      status: "done", phase: "done", colab_percent: 100,
      colab_created: created, colab_updated: 0, colab_quarentena: leaverMatriculas.length,
      message: `Concluído: ${created} inseridos${newMsg}${removedMsg}${syntheticMsg}`,
    }).eq("id", jobId);

    await sb.from("auditoria").insert({
      entidade: "importacao_csv", acao: "importar",
      resumo: `CSV importado: ${totalRows} linhas → ${created} inseridos, ${leaverMatriculas.length} removidos`,
      detalhes: { filename, totalRows, created, removed: leaverMatriculas.length, newJoiners: joinerMatriculas.size, jobId },
    });

    return { success: true, jobId, created, removed: leaverMatriculas.length, total: totalRows };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("Processing error:", msg);
    await sb.from("sync_jobs").update({ status: "error", error: msg, message: `Erro: ${msg}` }).eq("id", jobId);
    throw err;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const contentType = req.headers.get("content-type") || "";
    let csvText = "";
    let filename = "upload_manual";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) throw new Error("Nenhum arquivo CSV enviado");
      csvText = await file.text();
      filename = file.name || "upload_manual";
    } else {
      csvText = await req.text();
    }

    if (!csvText.trim()) throw new Error("CSV vazio");

    const result = await processCsvData(sb, csvText, filename);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("sync-csv-colab error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
