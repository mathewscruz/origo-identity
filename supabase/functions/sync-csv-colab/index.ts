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
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i], delimiter);
    if (values.length < rawHeaders.length * 0.5) continue;
    const row: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => {
      row[h] = values[idx] || "";
      if (reverseMap[h]) row[reverseMap[h]] = values[idx] || "";
    });
    if (!(row["employID"] || "").trim()) continue;
    rows.push(row);
  }
  console.log(`Parsed ${rows.length} rows`);
  return rows;
}

function hashFields(row: CsvRow): string {
  return [
    row.displayName, row.mail, row.company, row.title, row.departmentNumber,
    row.status, row.Data_Admissao, row.Data_Rescisao, row.Base_Local,
    row.manager, row.Cadastro_Pessoa_Fisica,
  ].join("|");
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
    // ── 2. Parse CSV ──
    const rows = parseCsv(csvText);
    const totalRows = rows.length;

    await sb.from("sync_jobs").update({ message: `Parsed ${totalRows} registros. Processando...`, phase: "hashing", colab_total: totalRows }).eq("id", jobId);

    // ── 3. Compute hashes for all rows ──
    const rowsWithHash: { row: CsvRow; matricula: string; hash: string }[] = [];
    for (const row of rows) {
      const matricula = row.employID.trim();
      if (!matricula) continue;
      const hash = await sha256(hashFields(row));
      rowsWithHash.push({ row, matricula, hash });
    }

    // ── 4. Load existing colaboradores (all CSV-origin) ──
    // Handle >1000 rows by paginating
    const existingMap = new Map<string, any>();
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await sb
        .from("colaboradores")
        .select("id, matricula, import_hash, nome, email, status, empresa_id, cargo_id, area_id, localidade_id, gestor_id, cpf, data_admissao, data_desligamento")
        .eq("origem", "csv")
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      data.forEach((c: any) => { if (c.matricula) existingMap.set(c.matricula, c); });
      if (data.length < PAGE) break;
      from += PAGE;
    }
    console.log(`Loaded ${existingMap.size} existing CSV colaboradores`);

    // ── 5. Classify rows: new / changed / unchanged ──
    const csvMatriculas = new Set<string>();
    const newRows: typeof rowsWithHash = [];
    const changedRows: (typeof rowsWithHash[0] & { existing: any })[] = [];
    const unchangedIds: string[] = [];

    for (const item of rowsWithHash) {
      csvMatriculas.add(item.matricula);
      const existing = existingMap.get(item.matricula);
      if (!existing) {
        newRows.push(item);
      } else if (existing.import_hash !== item.hash) {
        changedRows.push({ ...item, existing });
      } else {
        unchangedIds.push(existing.id);
      }
    }
    console.log(`Classification: ${newRows.length} new, ${changedRows.length} changed, ${unchangedIds.length} unchanged`);

    await sb.from("sync_jobs").update({
      phase: "lookups", message: `Resolvendo entidades auxiliares...`,
      colab_percent: 10,
    }).eq("id", jobId);

    // ── 6. Batch create lookup entities ──
    const empresaCache = new Map<string, string>();
    const cargoCache = new Map<string, string>();
    const areaCache = new Map<string, string>();
    const localCache = new Map<string, string>();

    // Pre-load existing lookups
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

    // Collect unique values to create
    const allRows = [...newRows.map(r => r.row), ...changedRows.map(r => r.row)];
    const missingEmpresas = new Set<string>();
    const missingCargos = new Set<string>();
    const missingAreas = new Set<string>();
    const missingLocais = new Set<string>();

    for (const row of allRows) {
      const company = row.company?.trim();
      if (company && company !== "NULL" && !empresaCache.has(company.toLowerCase())) missingEmpresas.add(company);
      const cargo = (row.title || row.description || "").trim();
      if (cargo && cargo !== "NULL" && !cargoCache.has(cargo.toLowerCase())) missingCargos.add(cargo);
      const area = row.departmentNumber?.trim();
      if (area && area !== "NULL" && !areaCache.has(area.toLowerCase())) missingAreas.add(area);
      const local = row.Base_Local?.trim();
      if (local && local !== "NULL" && !localCache.has(local.toLowerCase())) missingLocais.add(local);
    }

    // Batch insert missing empresas
    if (missingEmpresas.size > 0) {
      const toInsert = Array.from(missingEmpresas).map(nome => ({ nome }));
      for (const batch of chunk(toInsert, 200)) {
        const { data } = await sb.from("empresas").upsert(batch, { onConflict: "nome", ignoreDuplicates: true }).select("id, nome");
        if (data) data.forEach((e: any) => empresaCache.set(e.nome.toLowerCase(), e.id));
      }
      // Re-fetch to ensure we have all IDs (upsert may not return existing)
      const { data: allEmp } = await sb.from("empresas").select("id, nome");
      if (allEmp) allEmp.forEach((e: any) => empresaCache.set(e.nome.toLowerCase(), e.id));
    }

    // Batch insert missing cargos
    if (missingCargos.size > 0) {
      const toInsert = Array.from(missingCargos).map(nome => ({ nome }));
      for (const batch of chunk(toInsert, 200)) {
        await sb.from("cargos").upsert(batch, { onConflict: "nome", ignoreDuplicates: true });
      }
      const { data: allCargos } = await sb.from("cargos").select("id, nome");
      if (allCargos) allCargos.forEach((c: any) => cargoCache.set(c.nome.toLowerCase(), c.id));
    }

    // Batch insert missing areas
    if (missingAreas.size > 0) {
      const toInsert = Array.from(missingAreas).map(nome => ({ nome, empresa_id: PLACEHOLDER_EMPRESA_ID }));
      for (const batch of chunk(toInsert, 200)) {
        await sb.from("areas").insert(batch).select("id, nome");
      }
      const { data: allAreas } = await sb.from("areas").select("id, nome");
      if (allAreas) allAreas.forEach((a: any) => areaCache.set(a.nome.toLowerCase(), a.id));
    }

    // Batch insert missing localidades
    if (missingLocais.size > 0) {
      const toInsert = Array.from(missingLocais).map(nome => ({ nome, empresa_id: PLACEHOLDER_EMPRESA_ID }));
      for (const batch of chunk(toInsert, 200)) {
        await sb.from("localidades").insert(batch).select("id, nome");
      }
      const { data: allLocais } = await sb.from("localidades").select("id, nome");
      if (allLocais) allLocais.forEach((l: any) => localCache.set(l.nome.toLowerCase(), l.id));
    }

    console.log(`Lookups ready: ${empresaCache.size} empresas, ${cargoCache.size} cargos, ${areaCache.size} areas, ${localCache.size} locais`);

    // Helper to build colab data from a row
    function buildColabData(row: CsvRow, hash: string) {
      const statusMapped = STATUS_MAP[(row.status || "ativo").toLowerCase()] || "ativo";
      return {
        nome: row.displayName,
        email: row.mail || null,
        matricula: row.employID.trim(),
        cpf: row.Cadastro_Pessoa_Fisica || null,
        empresa_id: empresaCache.get((row.company || "").toLowerCase()) || null,
        cargo_id: cargoCache.get(((row.title || row.description || "").trim()).toLowerCase()) || null,
        area_id: areaCache.get((row.departmentNumber || "").toLowerCase()) || null,
        localidade_id: localCache.get((row.Base_Local || "").toLowerCase()) || null,
        status: statusMapped,
        data_admissao: parseDate(row.Data_Admissao),
        data_desligamento: parseDate(row.Data_Rescisao),
        origem: "csv",
        import_hash: hash,
        ultima_importacao_id: jobId,
      };
    }

    // ── 7. Batch INSERT new colaboradores ──
    await sb.from("sync_jobs").update({ phase: "inserting", message: `Inserindo ${newRows.length} novos colaboradores...`, colab_percent: 30 }).eq("id", jobId);

    let created = 0;
    const joinerEvents: any[] = [];
    const newColabChunks = chunk(newRows, 200);

    for (let ci = 0; ci < newColabChunks.length; ci++) {
      const batch = newColabChunks[ci];
      const insertData = batch.map(item => buildColabData(item.row, item.hash));
      const { data: inserted, error: insErr } = await sb.from("colaboradores").insert(insertData).select("id, nome, matricula");
      if (insErr) { console.error("Insert batch error:", insErr.message); continue; }
      if (inserted) {
        created += inserted.length;
        // Map back to rows for JML events
        const matriculaToRow = new Map(batch.map(b => [b.matricula, b.row]));
        for (const col of inserted) {
          const row = matriculaToRow.get(col.matricula);
          joinerEvents.push({
            tipo: "joiner",
            colaborador_id: col.id,
            colaborador_nome: col.nome,
            status: "pendente",
            origem: "importacao_csv",
            dados_depois: row || {},
          });
        }
      }
      // Progress
      const pct = 30 + Math.round((ci + 1) / newColabChunks.length * 20);
      await sb.from("sync_jobs").update({ colab_percent: pct, colab_created: created, message: `Inseridos ${created}/${newRows.length}...` }).eq("id", jobId);
    }

    // ── 8. Batch UPDATE changed colaboradores ──
    await sb.from("sync_jobs").update({ phase: "updating", message: `Atualizando ${changedRows.length} colaboradores...`, colab_percent: 55 }).eq("id", jobId);

    let updated = 0;
    const moverEvents: any[] = [];

    // Updates must be done individually since each row has different data, but we can batch the events
    const changedChunks = chunk(changedRows, 50);
    for (let ci = 0; ci < changedChunks.length; ci++) {
      const batch = changedChunks[ci];
      // Run updates in parallel within chunk
      await Promise.all(batch.map(async (item) => {
        const data = buildColabData(item.row, item.hash);
        const { error } = await sb.from("colaboradores").update(data).eq("id", item.existing.id);
        if (!error) {
          updated++;
          moverEvents.push({
            tipo: "mover",
            colaborador_id: item.existing.id,
            colaborador_nome: item.row.displayName,
            status: "pendente",
            origem: "importacao_csv",
            dados_antes: { nome: item.existing.nome, email: item.existing.email, status: item.existing.status },
            dados_depois: item.row,
          });
        }
      }));
      const pct = 55 + Math.round((ci + 1) / changedChunks.length * 15);
      await sb.from("sync_jobs").update({ colab_percent: pct, colab_updated: updated, message: `Atualizados ${updated}/${changedRows.length}...` }).eq("id", jobId);
    }

    // ── 9. Batch insert JML events ──
    await sb.from("sync_jobs").update({ phase: "events", message: "Registrando eventos JML...", colab_percent: 75 }).eq("id", jobId);

    const allEvents = [...joinerEvents, ...moverEvents];
    for (const batch of chunk(allEvents, 200)) {
      await sb.from("eventos_jml").insert(batch);
    }

    // ── 10. Detect LEAVERS (quarentena) ──
    await sb.from("sync_jobs").update({ phase: "quarentena", message: "Verificando ausências...", colab_percent: 80 }).eq("id", jobId);

    let quarentenaCount = 0;
    const quarentenaInserts: any[] = [];
    const leaverEvents: any[] = [];

    for (const [matricula, existing] of existingMap.entries()) {
      if (!csvMatriculas.has(matricula) && existing.status !== "desligado" && existing.status !== "inativo") {
        quarentenaCount++;
        quarentenaInserts.push({ colaborador_id: existing.id, import_job_id: jobId, motivo: "ausente_no_csv" });
        leaverEvents.push({
          tipo: "leaver",
          colaborador_id: existing.id,
          colaborador_nome: existing.nome,
          status: "quarentena",
          origem: "importacao_csv",
          dados_antes: { nome: existing.nome, email: existing.email, status: existing.status },
        });
      }
    }

    for (const batch of chunk(quarentenaInserts, 200)) await sb.from("colab_quarentena").insert(batch);
    for (const batch of chunk(leaverEvents, 200)) await sb.from("eventos_jml").insert(batch);

    // ── 11. Resolve gestores by name ──
    await sb.from("sync_jobs").update({ phase: "gestores", message: "Resolvendo gestores...", colab_percent: 90 }).eq("id", jobId);

    // Build name→id map
    const nameToId = new Map<string, string>();
    let gFrom = 0;
    while (true) {
      const { data } = await sb.from("colaboradores").select("id, nome").eq("origem", "csv").range(gFrom, gFrom + 999);
      if (!data || data.length === 0) break;
      data.forEach((c: any) => nameToId.set(c.nome.toLowerCase(), c.id));
      if (data.length < 1000) break;
      gFrom += 1000;
    }

    // Batch update gestores (parallel in chunks)
    const gestorUpdates: { matricula: string; gestorId: string }[] = [];
    for (const { row } of rowsWithHash) {
      if (!row.manager || row.manager === "NULL") continue;
      const gestorId = nameToId.get(row.manager.toLowerCase());
      if (gestorId) gestorUpdates.push({ matricula: row.employID.trim(), gestorId });
    }

    const gestorChunks = chunk(gestorUpdates, 50);
    for (const batch of gestorChunks) {
      await Promise.all(batch.map(({ matricula, gestorId }) =>
        sb.from("colaboradores").update({ gestor_id: gestorId }).eq("matricula", matricula).eq("origem", "csv")
      ));
    }

    // ── 12. Batch insert snapshots ──
    await sb.from("sync_jobs").update({ phase: "snapshots", message: "Salvando snapshots...", colab_percent: 95 }).eq("id", jobId);

    const snapshots = rowsWithHash.map(item => ({
      import_job_id: jobId,
      matricula: item.matricula,
      hash: item.hash,
      dados: item.row,
    }));
    for (const batch of chunk(snapshots, 200)) {
      await sb.from("colab_snapshots").insert(batch);
    }

    // ── 13. Finalize ──
    await sb.from("sync_jobs").update({
      status: "done", phase: "done", colab_percent: 100,
      colab_created: created, colab_updated: updated, colab_quarentena: quarentenaCount,
      message: `Concluído: ${created} novos, ${updated} atualizados, ${quarentenaCount} em quarentena`,
    }).eq("id", jobId);

    await sb.from("auditoria").insert({
      entidade: "importacao_csv", acao: "importar",
      resumo: `CSV importado: ${totalRows} linhas, ${created} novos, ${updated} atualizados, ${quarentenaCount} quarentena`,
      detalhes: { filename, totalRows, created, updated, quarentenaCount, jobId },
    });

    if (quarentenaCount > 0) {
      await sb.from("alertas").insert({
        tipo: "quarentena_csv",
        titulo: `${quarentenaCount} colaborador(es) em quarentena`,
        mensagem: `Importação CSV detectou ${quarentenaCount} colaborador(es) ausentes do arquivo.`,
        severidade: "aviso", ref_tipo: "sync_job", ref_id: jobId,
      });
    }

    return { success: true, jobId, created, updated, quarentena: quarentenaCount, total: totalRows };
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
