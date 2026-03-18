import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── CSV Parsing (same logic as sync-csv-colab, inlined because Edge Functions can't share code) ──

interface CsvRow { [key: string]: string; }

const REQUIRED_HEADERS = ["displayName","employID","mail","company","title","status","Data_Admissao","Cadastro_Pessoa_Fisica","Base_Local"];

const STATUS_MAP: Record<string, string> = {
  ativo: "ativo", demitido: "desligado", desligado: "desligado", afastado: "afastado",
  "férias": "ferias", ferias: "ferias", inativo: "inativo", suspenso: "afastado",
  licenca: "afastado", "licença": "afastado", aposentado: "desligado", transferido: "ativo",
};

function normalizeHeader(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g, " ").trim();
}

function findHeaderMatch(headers: string[], target: string): string | null {
  const normTarget = normalizeHeader(target);
  return headers.find(h => h === target) || headers.find(h => normalizeHeader(h) === normTarget) || headers.find(h => normalizeHeader(h).includes(normTarget)) || null;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') { if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = false; }
      else current += ch;
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
  return (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ";" : ",";
}

function parseCsv(text: string): CsvRow[] {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("CSV vazio ou sem dados");
  const delimiter = detectDelimiter(lines[0]);
  console.log(`Detected delimiter: "${delimiter}"`);
  const rawHeaders = splitCsvLine(lines[0], delimiter);
  console.log(`Headers (${rawHeaders.length}): ${rawHeaders.slice(0, 10).join(", ")}`);

  const headerMap: Record<string, string> = {};
  const missing: string[] = [];
  for (const req of REQUIRED_HEADERS) {
    const match = findHeaderMatch(rawHeaders, req);
    if (match) headerMap[req] = match; else missing.push(req);
  }
  if (missing.length > 0) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}`);

  const reverseMap: Record<string, string> = {};
  for (const [std, actual] of Object.entries(headerMap)) reverseMap[actual] = std;

  const rows: CsvRow[] = [];
  let syntheticCount = 0;
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i], delimiter);
    if (values.length < rawHeaders.length * 0.5) continue;
    const row: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => { row[h] = values[idx] || ""; if (reverseMap[h]) row[reverseMap[h]] = values[idx] || ""; });
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

function hashFields(row: CsvRow): string {
  return [row.displayName, row.mail, row.company, row.title, row.description, row.departmentNumber, row.status, row.Data_Admissao, row.Data_Rescisao, row.Base_Local, row.manager, row.Cadastro_Pessoa_Fisica].join("|");
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function parseDate(d: string): string | null {
  if (!d || d === "NULL") return null;
  const parts = d.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const c: T[][] = [];
  for (let i = 0; i < arr.length; i += size) c.push(arr.slice(i, i + size));
  return c;
}

const PLACEHOLDER_EMPRESA_ID = "00000000-0000-0000-0000-000000000000";

// ── Full batch processing logic (identical to sync-csv-colab) ──
async function processCsvData(sb: any, csvText: string, filename: string) {
  const { data: job, error: jobErr } = await sb.from("sync_jobs")
    .insert({ status: "running", tipo: "csv_colab", message: "Iniciando importação CSV (SharePoint)...", phase: "parsing", filename })
    .select().single();
  if (jobErr) throw jobErr;
  const jobId = job.id;

  try {
    const rows = parseCsv(csvText);
    const totalRows = rows.length;
    await sb.from("sync_jobs").update({ message: `Parsed ${totalRows} registros.`, phase: "hashing", colab_total: totalRows }).eq("id", jobId);

    let rowsWithHash: { row: CsvRow; matricula: string; hash: string }[] = [];
    let syntheticMatCount = 0;
    for (const row of rows) {
      const matricula = row.employID.trim();
      if (!matricula) continue;
      if (row["__synthetic_matricula"] === "true") syntheticMatCount++;
      rowsWithHash.push({ row, matricula, hash: await sha256(hashFields(row)) });
    }

    // Deduplicate matriculas — append _DUP_N for repeated employIDs
    const matCount = new Map<string, number>();
    let dupCount = 0;
    for (const item of rowsWithHash) {
      const count = (matCount.get(item.matricula) || 0) + 1;
      matCount.set(item.matricula, count);
      if (count > 1) {
        dupCount++;
        item.matricula = `${item.matricula}_DUP_${count}`;
        item.row.employID = item.matricula;
        item.hash = await sha256(hashFields(item.row));
      }
    }
    if (dupCount > 0) console.log(`${dupCount} duplicate matriculas suffixed with _DUP_N`);

    // Load existing
    const existingMap = new Map<string, any>();
    let from = 0;
    while (true) {
      const { data } = await sb.from("colaboradores").select("id, matricula, import_hash, nome, email, status, empresa_id, cargo_id, area_id, localidade_id, gestor_id, cpf, data_admissao, data_desligamento").eq("origem", "csv").range(from, from + 999);
      if (!data || data.length === 0) break;
      data.forEach((c: any) => { if (c.matricula) existingMap.set(c.matricula, c); });
      if (data.length < 1000) break;
      from += 1000;
    }

    const csvMatriculas = new Set<string>();
    const newRows: typeof rowsWithHash = [];
    const changedRows: (typeof rowsWithHash[0] & { existing: any })[] = [];

    for (const item of rowsWithHash) {
      csvMatriculas.add(item.matricula);
      const existing = existingMap.get(item.matricula);
      if (!existing) newRows.push(item);
      else if (existing.import_hash !== item.hash) changedRows.push({ ...item, existing });
    }
    console.log(`${newRows.length} new, ${changedRows.length} changed, ${rowsWithHash.length - newRows.length - changedRows.length} unchanged`);

    await sb.from("sync_jobs").update({ phase: "lookups", message: "Resolvendo entidades...", colab_percent: 10 }).eq("id", jobId);

    // Lookups
    const empresaCache = new Map<string, string>();
    const cargoCache = new Map<string, string>();
    const areaCache = new Map<string, string>();
    const localCache = new Map<string, string>();

    const [empresas, cargosData, areasData, locaisData] = await Promise.all([
      sb.from("empresas").select("id, nome"), sb.from("cargos").select("id, nome"),
      sb.from("areas").select("id, nome"), sb.from("localidades").select("id, nome"),
    ]);
    (empresas.data || []).forEach((e: any) => empresaCache.set(e.nome.toLowerCase(), e.id));
    (cargosData.data || []).forEach((c: any) => cargoCache.set(c.nome.toLowerCase(), c.id));
    (areasData.data || []).forEach((a: any) => areaCache.set(a.nome.toLowerCase(), a.id));
    (locaisData.data || []).forEach((l: any) => localCache.set(l.nome.toLowerCase(), l.id));

    const allRows = [...newRows.map(r => r.row), ...changedRows.map(r => r.row)];
    const missingEmpresas = new Set<string>(), missingCargos = new Set<string>(), missingAreas = new Set<string>(), missingLocais = new Set<string>();

    for (const row of allRows) {
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
      for (const b of chunk(Array.from(missingEmpresas).map(nome => ({ nome })), 200))
        await sb.from("empresas").upsert(b, { onConflict: "nome", ignoreDuplicates: true });
      const { data } = await sb.from("empresas").select("id, nome");
      if (data) data.forEach((e: any) => empresaCache.set(e.nome.toLowerCase(), e.id));
    }
    if (missingCargos.size > 0) {
      for (const b of chunk(Array.from(missingCargos).map(nome => ({ nome })), 200))
        await sb.from("cargos").upsert(b, { onConflict: "nome", ignoreDuplicates: true });
      const { data } = await sb.from("cargos").select("id, nome");
      if (data) data.forEach((c: any) => cargoCache.set(c.nome.toLowerCase(), c.id));
    }
    if (missingAreas.size > 0) {
      for (const b of chunk(Array.from(missingAreas).map(nome => ({ nome, empresa_id: PLACEHOLDER_EMPRESA_ID })), 200))
        await sb.from("areas").insert(b);
      const { data } = await sb.from("areas").select("id, nome");
      if (data) data.forEach((a: any) => areaCache.set(a.nome.toLowerCase(), a.id));
    }
    if (missingLocais.size > 0) {
      for (const b of chunk(Array.from(missingLocais).map(nome => ({ nome, empresa_id: PLACEHOLDER_EMPRESA_ID })), 200))
        await sb.from("localidades").insert(b);
      const { data } = await sb.from("localidades").select("id, nome");
      if (data) data.forEach((l: any) => localCache.set(l.nome.toLowerCase(), l.id));
    }

    function buildColabData(row: CsvRow, hash: string) {
      return {
        nome: row.displayName, email: row.mail || null, matricula: row.employID.trim(),
        cpf: row.Cadastro_Pessoa_Fisica || null,
        empresa_id: empresaCache.get((row.company || "").toLowerCase()) || null,
        cargo_id: cargoCache.get(((row.description || row.title || "").trim()).toLowerCase()) || null,
        area_id: areaCache.get((row.departmentNumber || "").toLowerCase()) || null,
        localidade_id: localCache.get((row.Base_Local || "").toLowerCase()) || null,
        status: STATUS_MAP[(row.status || "ativo").toLowerCase()] || "ativo",
        data_admissao: parseDate(row.Data_Admissao), data_desligamento: parseDate(row.Data_Rescisao),
        origem: "csv", import_hash: hash, ultima_importacao_id: jobId,
      };
    }

    // Insert new
    await sb.from("sync_jobs").update({ phase: "inserting", message: `Inserindo ${newRows.length} novos...`, colab_percent: 30 }).eq("id", jobId);
    let created = 0;
    const joinerEvents: any[] = [];
    for (const batch of chunk(newRows, 500)) {
      const { data: inserted } = await sb.from("colaboradores").insert(batch.map(i => buildColabData(i.row, i.hash))).select("id, nome, matricula");
      if (inserted) {
        created += inserted.length;
        const m2r = new Map(batch.map(b => [b.matricula, b.row]));
        for (const c of inserted) joinerEvents.push({ tipo: "joiner", colaborador_id: c.id, colaborador_nome: c.nome, status: "pendente", origem: "importacao_csv", dados_depois: m2r.get(c.matricula) || {} });
      }
      await sb.from("sync_jobs").update({ colab_created: created, colab_percent: 30 + Math.round(created / Math.max(newRows.length, 1) * 20) }).eq("id", jobId);
    }

    // Update changed
    await sb.from("sync_jobs").update({ phase: "updating", message: `Atualizando ${changedRows.length}...`, colab_percent: 55 }).eq("id", jobId);
    let updated = 0;
    const moverEvents: any[] = [];
    for (const batch of chunk(changedRows, 50)) {
      await Promise.all(batch.map(async item => {
        const { error } = await sb.from("colaboradores").update(buildColabData(item.row, item.hash)).eq("id", item.existing.id);
        if (!error) {
          updated++;
          moverEvents.push({ tipo: "mover", colaborador_id: item.existing.id, colaborador_nome: item.row.displayName, status: "pendente", origem: "importacao_csv", dados_antes: { nome: item.existing.nome, status: item.existing.status }, dados_depois: item.row });
        }
      }));
      await sb.from("sync_jobs").update({ colab_updated: updated, colab_percent: 55 + Math.round(updated / Math.max(changedRows.length, 1) * 15) }).eq("id", jobId);
    }

    // Events
    for (const b of chunk([...joinerEvents, ...moverEvents], 200)) await sb.from("eventos_jml").insert(b);

    // Leavers
    await sb.from("sync_jobs").update({ phase: "quarentena", message: "Verificando ausências...", colab_percent: 80 }).eq("id", jobId);
    let quarentenaCount = 0;
    const qInserts: any[] = [], lEvents: any[] = [];
    for (const [mat, ex] of existingMap.entries()) {
      if (!csvMatriculas.has(mat) && ex.status !== "desligado" && ex.status !== "inativo") {
        quarentenaCount++;
        qInserts.push({ colaborador_id: ex.id, import_job_id: jobId, motivo: "ausente_no_csv" });
        lEvents.push({ tipo: "leaver", colaborador_id: ex.id, colaborador_nome: ex.nome, status: "quarentena", origem: "importacao_csv", dados_antes: { nome: ex.nome, status: ex.status } });
      }
    }
    for (const b of chunk(qInserts, 200)) await sb.from("colab_quarentena").insert(b);
    for (const b of chunk(lEvents, 200)) await sb.from("eventos_jml").insert(b);

    // Gestores and Snapshots skipped in SharePoint sync for performance (avoids timeout)
    // Gestores can be resolved via a separate manual trigger if needed

    // Done
    const syntheticMsg = syntheticMatCount > 0 ? `, ${syntheticMatCount} sem matrícula original` : "";
    await sb.from("sync_jobs").update({ status: "done", phase: "done", colab_percent: 100, colab_created: created, colab_updated: updated, colab_quarentena: quarentenaCount, message: `Concluído: ${created} novos, ${updated} atualizados, ${quarentenaCount} quarentena${syntheticMsg}` }).eq("id", jobId);
    await sb.from("auditoria").insert({ entidade: "importacao_csv", acao: "importar", resumo: `CSV SharePoint: ${totalRows} linhas, ${created} novos, ${updated} atualizados, ${quarentenaCount} quarentena`, detalhes: { filename, totalRows, created, updated, quarentenaCount, jobId } });
    if (quarentenaCount > 0) await sb.from("alertas").insert({ tipo: "quarentena_csv", titulo: `${quarentenaCount} colaborador(es) em quarentena`, mensagem: `Importação CSV detectou ${quarentenaCount} colaborador(es) ausentes.`, severidade: "aviso", ref_tipo: "sync_job", ref_id: jobId });

    return { success: true, jobId, file: filename, created, updated, quarentena: quarentenaCount, total: totalRows };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("Processing error:", msg);
    await sb.from("sync_jobs").update({ status: "error", error: msg, message: `Erro: ${msg}` }).eq("id", jobId);
    throw err;
  }
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const TENANT_ID = Deno.env.get("AZURE_TENANT_ID");
  const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: "Azure credentials not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // 1. Azure AD token
    console.log("Authenticating with Azure AD...");
    const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    });
    if (!tokenRes.ok) throw new Error(`Azure auth failed: ${tokenRes.status}`);
    const { access_token } = await tokenRes.json();
    console.log("Azure AD token acquired");

    const graphHeaders = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };

    // 2. Resolve SharePoint site
    console.log("Resolving SharePoint site...");
    const siteRes = await fetch("https://graph.microsoft.com/v1.0/sites/origoenergia.sharepoint.com:/sites/dataanalytics", { headers: graphHeaders });
    if (!siteRes.ok) throw new Error(`Site resolution failed: ${siteRes.status}`);
    const site = await siteRes.json();
    const siteId = site.id;
    console.log(`Site resolved: ${siteId}`);

    // 3. List files
    console.log("Listing files in RH_COLAB...");
    const filesRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/RH_COLAB:/children?$orderby=lastModifiedDateTime desc&$top=50`, { headers: graphHeaders });
    if (!filesRes.ok) throw new Error(`Folder listing failed: ${filesRes.status}`);
    const filesData = await filesRes.json();
    const csvFiles = (filesData.value || []).filter((f: any) => f.name?.toLowerCase().startsWith("base_colab_") && f.name?.toLowerCase().endsWith(".csv"));

    if (csvFiles.length === 0) {
      return new Response(JSON.stringify({ error: "No CSV files found with prefix base_colab_" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const latestFile = csvFiles[0];
    console.log(`Latest CSV: ${latestFile.name} (modified: ${latestFile.lastModifiedDateTime})`);

    // 4. Download CSV
    const downloadUrl = latestFile["@microsoft.graph.downloadUrl"];
    let csvBytes: Uint8Array;
    if (downloadUrl) {
      const dlRes = await fetch(downloadUrl);
      if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
      csvBytes = new Uint8Array(await dlRes.arrayBuffer());
    } else {
      const dlRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${latestFile.id}/content`, { headers: graphHeaders });
      if (!dlRes.ok) throw new Error(`Download via content failed: ${dlRes.status}`);
      csvBytes = new Uint8Array(await dlRes.arrayBuffer());
    }
    console.log(`Downloaded ${csvBytes.length} bytes`);

    // 5. Process CSV DIRECTLY (no function-to-function call)
    const csvText = new TextDecoder("utf-8").decode(csvBytes);
    const result = await processCsvData(sb, csvText, latestFile.name);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
