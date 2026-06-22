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
  const matCount = new Map<string, number>();

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

    const baseMat = row["employID"].trim();
    const count = matCount.get(baseMat) || 0;
    matCount.set(baseMat, count + 1);
    if (count > 0) {
      row["employID"] = `${baseMat}_ROW_${count + 1}`;
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

function buildFingerprint(row: CsvRow): string {
  return [
    row.displayName || "",
    row.mail || "",
    (row.status || "ativo").toLowerCase(),
    row.company || "",
    (row.description || row.title || ""),
    row.departmentNumber || "",
    row.Base_Local || "",
    row.Cadastro_Pessoa_Fisica || "",
    row.Data_Admissao || "",
    row.Data_Rescisao || "",
  ].join("|").toLowerCase();
}

/** Build reverse lookup maps: id -> nome */
function buildNameLookup(cache: Map<string, string>): Map<string, string> {
  const reverse = new Map<string, string>();
  for (const [name, id] of cache) {
    reverse.set(id, name);
  }
  return reverse;
}

/** Provision cargo-based access profiles and queue Entra ID group/license assignments */
async function provisionCargoAcessosServer(
  sb: any,
  colaboradorId: string,
  newCargoId: string | null,
  oldCargoId: string | null,
  samAccountName: string,
  displayName: string,
  mail: string
) {
  // Revoke old cargo-based assignments (DB only — no Entra removal, access is additive)
  if (oldCargoId) {
    await sb
      .from("perfil_atribuicoes")
      .update({ ativo: false, data_revogacao: new Date().toISOString() })
      .eq("colaborador_id", colaboradorId)
      .eq("origem", "cargo")
      .eq("ativo", true);
  }

  // Assign new cargo profiles
  if (newCargoId) {
    const { data: cargoPerfis } = await sb
      .from("cargo_perfis")
      .select("perfil_id")
      .eq("cargo_id", newCargoId);

    if (cargoPerfis && cargoPerfis.length > 0) {
      const inserts = cargoPerfis.map((cp: any) => ({
        perfil_id: cp.perfil_id,
        colaborador_id: colaboradorId,
        origem: "cargo",
        ativo: true,
      }));
      await sb.from("perfil_atribuicoes").insert(inserts);

      if (samAccountName) {
        for (const cp of cargoPerfis) {
          await queueProfileAccess(sb, samAccountName, displayName, mail, cp.perfil_id, "add");
        }
      }
    }
  }
}

async function queueProfileAccess(
  sb: any,
  samAccountName: string,
  displayName: string,
  mail: string,
  perfilId: string,
  action: "add" | "remove"
) {
  const { data: grupos } = await sb
    .from("perfil_grupos")
    .select("grupo_id, entra_grupos(entra_id, nome)")
    .eq("perfil_id", perfilId);

  if (grupos) {
    for (const g of grupos) {
      if (!g.entra_grupos) continue;
      await sb.from("iam_queue").insert({
        action_type: action === "add" ? "assign_group" : "remove_group",
        payload_json: {
          samAccountName,
          displayName,
          mail,
          groupId: g.entra_grupos.entra_id,
          groupName: g.entra_grupos.nome,
          action,
        },
        target_identity: samAccountName,
        requested_by: "importacao_csv",
        status: "pending",
      });
    }
  }

  const { data: licencas } = await sb
    .from("perfil_licencas")
    .select("licenca_id, entra_licencas(sku_id, nome)")
    .eq("perfil_id", perfilId);

  if (licencas) {
    for (const l of licencas) {
      if (!l.entra_licencas) continue;
      await sb.from("iam_queue").insert({
        action_type: action === "add" ? "assign_license" : "remove_license",
        payload_json: {
          samAccountName,
          displayName,
          mail,
          skuId: l.entra_licencas.sku_id,
          licenseName: l.entra_licencas.nome,
          action,
        },
        target_identity: samAccountName,
        requested_by: "importacao_csv",
        status: "pending",
      });
    }
  }

  // Apps with entra_id
  const { data: apps } = await sb
    .from("perfil_aplicacoes")
    .select("aplicacao_id, aplicacoes(entra_id, nome, default_app_role_id)")
    .eq("perfil_id", perfilId);

  if (apps) {
    for (const a of apps) {
      if (!a.aplicacoes || !a.aplicacoes.entra_id) continue;
      await sb.from("iam_queue").insert({
        action_type: action === "add" ? "assign_app" : "remove_app",
        payload_json: {
          samAccountName,
          displayName,
          mail,
          appId: a.aplicacoes.entra_id,
          appName: a.aplicacoes.nome,
          appRoleId: a.aplicacoes.default_app_role_id || "00000000-0000-0000-0000-000000000000",
          action,
        },
        target_identity: samAccountName,
        requested_by: "importacao_csv",
        status: "pending",
      });
    }
  }
}

const PREPOSITIONS = new Set(["de", "da", "do", "dos", "das", "e", "del", "di"]);

function normalizeNamePart(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function generateOrigoEmail(displayName: string, existingEmails: Set<string>): string | null {
  if (!displayName || !displayName.trim()) return null;

  const parts = displayName
    .trim()
    .split(/\s+/)
    .map(normalizeNamePart)
    .filter((p) => p.length > 0 && !PREPOSITIONS.has(p));

  if (parts.length === 0) return null;

  const domain = "@origoenergia.com.br";
  const first = parts[0];

  // Single name — just use it
  if (parts.length === 1) {
    const candidate = `${first}${domain}`;
    if (!existingEmails.has(candidate)) return candidate;
    // Add numeric suffix
    for (let i = 2; i <= 99; i++) {
      const c = `${first}${i}${domain}`;
      if (!existingEmails.has(c)) return c;
    }
    return null;
  }

  const last = parts[parts.length - 1];
  const middles = parts.slice(1, -1);

  // Try 1: first.last
  const try1 = `${first}.${last}${domain}`;
  if (!existingEmails.has(try1)) return try1;

  // Try 2: first.middle (use first middle name)
  if (middles.length > 0) {
    const try2 = `${first}.${middles[0]}${domain}`;
    if (!existingEmails.has(try2)) return try2;
  }

  // Try 3: first.middle.last
  if (middles.length > 0) {
    const try3 = `${first}.${middles[0]}.${last}${domain}`;
    if (!existingEmails.has(try3)) return try3;
  }

  // Try 4: all parts joined
  const tryFull = parts.join(".") + domain;
  if (!existingEmails.has(tryFull)) return tryFull;

  // Try 5: numeric suffix on first.last
  for (let i = 2; i <= 99; i++) {
    const c = `${first}.${last}${i}${domain}`;
    if (!existingEmails.has(c)) return c;
  }

  return null;
}

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

    await sb.from("sync_jobs").update({ message: `Parsed ${totalRows} registros. Comparando...`, phase: "comparing", colab_total: totalRows }).eq("id", jobId);

    // ── 3. Load existing CSV-origin records ──
    const existingMap = new Map<string, { id: string; fingerprint: string; cargo_id: string | null; sam_account_name: string | null; status: string; desligado_manual: boolean; desligado_manual_em: string | null; nome: string | null }>();
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await sb
        .from("colaboradores")
        .select("id, matricula, nome, email, status, empresa_id, cargo_id, area_id, localidade_id, cpf, data_admissao, data_desligamento, import_hash, sam_account_name, desligado_manual, desligado_manual_em")
        .eq("origem", "csv")
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      data.forEach((c: any) => {
        if (c.matricula) {
          existingMap.set(c.matricula, {
            id: c.id,
            fingerprint: c.import_hash || "",
            cargo_id: c.cargo_id,
            sam_account_name: c.sam_account_name,
            status: c.status,
            desligado_manual: !!c.desligado_manual,
            desligado_manual_em: c.desligado_manual_em || null,
            nome: c.nome || null,
          });
        }
      });
      if (data.length < PAGE) break;
      from += PAGE;
    }
    console.log(`Existing CSV colaboradores: ${existingMap.size}`);

    // ── 4. Resolve lookup entities ──
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

    // Build reverse lookups (id -> name) for payload enrichment
    const empresaNames = buildNameLookup(empresaCache);
    const cargoNames = buildNameLookup(cargoCache);
    const areaNames = buildNameLookup(areaCache);

    // ── Load existing emails for corporate email generation ──
    const existingEmails = new Set<string>();
    let emailFrom = 0;
    while (true) {
      const { data: emailData } = await sb
        .from("colaboradores")
        .select("email")
        .not("email", "is", null)
        .range(emailFrom, emailFrom + PAGE - 1);
      if (!emailData || emailData.length === 0) break;
      emailData.forEach((c: any) => {
        if (c.email) existingEmails.add(c.email.toLowerCase());
      });
      if (emailData.length < PAGE) break;
      emailFrom += PAGE;
    }
    console.log(`Loaded ${existingEmails.size} existing emails for dedup`);

    function buildColabData(row: CsvRow) {
      const statusMapped = STATUS_MAP[(row.status || "ativo").toLowerCase()] || "ativo";
      let email = row.mail || "";
      // Prioritize sAMAccountName from CSV when available
      const csvSam = (row.sAMAccountName || "").trim();
      let samAccountName = csvSam || (email.includes("@") ? email.split("@")[0] : (row.employID || "").trim());

      // Generate corporate email if not @origoenergia.com.br
      if (email && !email.toLowerCase().endsWith("@origoenergia.com.br")) {
        const generated = generateOrigoEmail(row.displayName || "", existingEmails);
        if (generated) {
          email = generated;
          // Only override samAccountName if CSV didn't provide one
          if (!csvSam) samAccountName = generated.split("@")[0];
          existingEmails.add(generated.toLowerCase());
          console.log(`Generated corporate email for "${row.displayName}": ${generated}`);
        }
      } else if (!email && row.displayName) {
        const generated = generateOrigoEmail(row.displayName, existingEmails);
        if (generated) {
          email = generated;
          if (!csvSam) samAccountName = generated.split("@")[0];
          existingEmails.add(generated.toLowerCase());
          console.log(`Generated corporate email (no original) for "${row.displayName}": ${generated}`);
        }
      }

      return {
        nome: row.displayName,
        email: email || null,
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
        import_hash: buildFingerprint(row),
        sam_account_name: samAccountName,
      };
    }

    // ── 5. Classify rows ──
    await sb.from("sync_jobs").update({ phase: "classifying", message: "Classificando mudanças...", colab_percent: 20 }).eq("id", jobId);

    const toInsert: any[] = [];
    const toUpdate: { id: string; data: any; oldCargoId: string | null; oldStatus: string; oldSam: string | null }[] = [];
    const csvMatriculas = new Set<string>();
    let unchanged = 0;

    for (const row of rows) {
      const mat = row.employID.trim();
      csvMatriculas.add(mat);
      const fp = buildFingerprint(row);
      const existing = existingMap.get(mat);

      if (!existing) {
        toInsert.push(buildColabData(row));
      } else if (existing.fingerprint !== fp) {
        toUpdate.push({
          id: existing.id,
          data: buildColabData(row),
          oldCargoId: existing.cargo_id,
          oldStatus: existing.status,
          oldSam: existing.sam_account_name,
        });
      } else {
        unchanged++;
      }
    }

    // Leavers: matriculas in DB but not in CSV
    const leaverIds: string[] = [];
    const leaverMatriculas: string[] = [];
    const leaverDetails: { id: string; sam: string | null; cargo_id: string | null }[] = [];
    for (const [mat, rec] of existingMap) {
      if (!csvMatriculas.has(mat)) {
        leaverIds.push(rec.id);
        leaverMatriculas.push(mat);
        leaverDetails.push({ id: rec.id, sam: rec.sam_account_name, cargo_id: rec.cargo_id });
      }
    }

    console.log(`Classification: ${toInsert.length} new, ${toUpdate.length} changed, ${unchanged} unchanged, ${leaverIds.length} leavers`);

    // ── 6. Execute INSERTs ──
    await sb.from("sync_jobs").update({ phase: "inserting", message: `Inserindo ${toInsert.length} novos...`, colab_percent: 30 }).eq("id", jobId);

    let created = 0;
    const insertedIds: { id: string; data: any }[] = [];
    if (toInsert.length > 0) {
      const insertChunks = chunk(toInsert, 500);
      for (let ci = 0; ci < insertChunks.length; ci++) {
        const { data: inserted, error: insErr } = await sb.from("colaboradores").insert(insertChunks[ci]).select("id");
        if (insErr) { console.error("Insert batch error:", insErr.message); continue; }
        if (inserted) {
          created += inserted.length;
          // Map inserted IDs back to data
          inserted.forEach((ins: any, idx: number) => {
            const dataIdx = ci * 500 + idx;
            if (dataIdx < toInsert.length) {
              insertedIds.push({ id: ins.id, data: toInsert[dataIdx] });
            }
          });
        }
        const pct = 30 + Math.round((ci + 1) / insertChunks.length * 20);
        await sb.from("sync_jobs").update({ colab_percent: pct, colab_created: created, message: `Inseridos ${created}/${toInsert.length}...` }).eq("id", jobId);
      }
    }

    // ── 7. Execute UPDATEs ──
    await sb.from("sync_jobs").update({ phase: "updating", message: `Atualizando ${toUpdate.length} registros...`, colab_percent: 55 }).eq("id", jobId);

    let updated = 0;
    if (toUpdate.length > 0) {
      const updateChunks = chunk(toUpdate, 200);
      for (let ci = 0; ci < updateChunks.length; ci++) {
        for (const item of updateChunks[ci]) {
          const { error } = await sb.from("colaboradores").update(item.data).eq("id", item.id);
          if (error) { console.error("Update error:", error.message); continue; }
          updated++;
        }
        const pct = 55 + Math.round((ci + 1) / updateChunks.length * 15);
        await sb.from("sync_jobs").update({ colab_percent: pct, colab_updated: updated }).eq("id", jobId);
      }
    }

    // ── 8. Handle leavers: disable in AD BEFORE deleting ──
    if (leaverIds.length > 0) {
      await sb.from("sync_jobs").update({ phase: "removing", message: `Removendo ${leaverIds.length} ausentes...`, colab_percent: 75 }).eq("id", jobId);

      // Gap 4: Generate iam_queue disable entries for leavers
      const leaverIamEntries = leaverDetails
        .filter(l => l.sam)
        .map(l => ({
          action_type: "disable",
          payload_json: {
            samAccountName: l.sam,
            displayName: "",
            mail: "",
            status: "disabled",
            status_anterior: "ativo",
            status_novo: "desligado",
            changed_fields: ["status"],
            new_values: { status: "disabled" },
          },
          target_identity: l.sam,
          colaborador_id: l.id,
          requested_by: "importacao_csv",
          status: "pending",
        }));
      if (leaverIamEntries.length > 0) {
        for (const batch of chunk(leaverIamEntries, 200)) await sb.from("iam_queue").insert(batch);
      }

      // Revoke access profiles for leavers before deleting
      for (const l of leaverDetails) {
        if (l.cargo_id && l.sam) {
          await provisionCargoAcessosServer(sb, l.id, null, l.cargo_id, l.sam, "", "");
        }
      }

      // Disable Entra ID accounts for leavers
      const leaverEntraEntries = leaverDetails
        .filter(l => l.sam)
        .map(l => ({
          action_type: "disable_entra",
          payload_json: { samAccountName: l.sam, displayName: "", mail: "" },
          target_identity: l.sam,
          colaborador_id: l.id,
          requested_by: "importacao_csv",
          status: "pending",
        }));
      if (leaverEntraEntries.length > 0) {
        for (const batch of chunk(leaverEntraEntries, 200)) await sb.from("iam_queue").insert(batch);
      }

      for (const batch of chunk(leaverIds, 200)) {
        // Clean up dependent tables first
        await sb.from("perfil_atribuicoes").delete().in("colaborador_id", batch);
        await sb.from("excecoes").delete().in("colaborador_id", batch);
        await sb.from("revisao_itens").delete().in("colaborador_id", batch);
        const { error } = await sb.from("colaboradores").delete().in("id", batch);
        if (error) console.error("Delete batch error:", error.message);
      }
    }

    // ── 9. Update unchanged records' ultima_importacao_id ──
    if (unchanged > 0) {
      const unchangedMats: string[] = [];
      for (const row of rows) {
        const mat = row.employID.trim();
        const existing = existingMap.get(mat);
        if (existing && existing.fingerprint === buildFingerprint(row)) {
          unchangedMats.push(existing.id);
        }
      }
      for (const batch of chunk(unchangedMats, 500)) {
        await sb.from("colaboradores").update({ ultima_importacao_id: jobId }).in("id", batch);
      }
    }

    // ── 10. Register JML events ──
    await sb.from("sync_jobs").update({ phase: "events", message: "Registrando eventos JML...", colab_percent: 85 }).eq("id", jobId);

    if (leaverMatriculas.length > 0) {
      const leaverEvents = leaverMatriculas.map(mat => ({
        tipo: "leaver",
        colaborador_nome: mat,
        status: "pendente",
        origem: "importacao_csv",
        dados_antes: { matricula: mat },
      }));
      for (const batch of chunk(leaverEvents, 200)) await sb.from("eventos_jml").insert(batch);
    }

    if (toInsert.length > 0) {
      const joinerEvents = toInsert.map(c => ({
        tipo: "joiner",
        colaborador_nome: c.nome || c.matricula,
        status: "pendente",
        origem: "importacao_csv",
        dados_depois: { matricula: c.matricula, nome: c.nome },
      }));
      for (const batch of chunk(joinerEvents, 200)) await sb.from("eventos_jml").insert(batch);

      // Gap 2: Generate iam_queue entries with enriched payloads
      const iamEntries = toInsert.filter(c => c.sam_account_name).map(c => {
        const nameParts = (c.nome || "").split(" ");
        const givenName = nameParts[0] || "";
        const surname = nameParts.slice(1).join(" ") || givenName;
        const companyName = c.empresa_id ? (empresaNames.get(c.empresa_id) || null) : null;
        const titleName = c.cargo_id ? (cargoNames.get(c.cargo_id) || null) : null;
        const deptName = c.area_id ? (areaNames.get(c.area_id) || null) : null;
        return {
          action_type: "create_if_not_exists",
          payload_json: {
            givenName,
            surname,
            displayName: c.nome,
            samAccountName: c.sam_account_name,
            userPrincipalName: `${c.sam_account_name}@ebessolar.local`,
            mail: c.email,
            department: deptName,
            title: titleName,
            company: companyName,
            telephoneNumber: null,
            manager: null,
            ouPath: "",
          },
          target_identity: c.sam_account_name,
          requested_by: "importacao_csv",
          status: "pending",
        };
      });
      for (const batch of chunk(iamEntries, 200)) await sb.from("iam_queue").insert(batch);

      // Gap 5: Provision access profiles for new joiners (immediate - Gap 6 option A)
      for (const ins of insertedIds) {
        if (ins.data.cargo_id && ins.data.sam_account_name) {
          await provisionCargoAcessosServer(
            sb, ins.id, ins.data.cargo_id, null,
            ins.data.sam_account_name, ins.data.nome || "", ins.data.email || ""
          );
        }

        // Sync current Entra ID access as individual records
        if (ins.data.email || ins.data.sam_account_name) {
          try {
            const syncUrl = `${supabaseUrl}/functions/v1/sync-user-access`;
            await fetch(syncUrl, {
              method: "POST",
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ colaborador_id: ins.id }),
            });
          } catch (e) {
            console.warn(`[sync-user-access] Error for ${ins.id}:`, e);
          }
        }
      }
    }

    if (toUpdate.length > 0) {
      const moverEvents = toUpdate.map(u => ({
        tipo: "mover",
        colaborador_nome: u.data.nome || u.data.matricula,
        colaborador_id: u.id,
        status: "pendente",
        origem: "importacao_csv",
        dados_depois: { matricula: u.data.matricula, nome: u.data.nome },
      }));
      for (const batch of chunk(moverEvents, 200)) await sb.from("eventos_jml").insert(batch);

      // Gap 3: Generate iam_queue for movers
      for (const item of toUpdate) {
        const sam = item.data.sam_account_name || item.oldSam;
        if (!sam) continue;

        const newStatus = item.data.status;
        const oldStatus = item.oldStatus;
        const isFullDisable = (newStatus === "desligado" || newStatus === "inativo") && oldStatus !== newStatus;
        const isSoftDisable = (newStatus === "ferias" || newStatus === "afastado") && oldStatus !== newStatus;
        const disabledStatuses = ["desligado", "inativo", "ferias", "afastado"];
        const isReactivating = newStatus === "ativo" && oldStatus !== "ativo" && disabledStatuses.includes(oldStatus);

        if (isFullDisable) {
          // Full disable: disable AD + Entra + remove ALL access
          await sb.from("iam_queue").insert({
            action_type: "disable",
            payload_json: {
              samAccountName: sam,
              mail: item.data.email || "",
              displayName: item.data.nome || "",
              status: "disabled",
              status_anterior: oldStatus,
              status_novo: newStatus,
              changed_fields: ["status"],
              new_values: { status: "disabled" },
            },
            target_identity: sam,
            colaborador_id: item.id,
            requested_by: "importacao_csv",
            status: "pending",
          });

          // Revoke cargo-based access profiles (removes groups/licenses/apps)
          if (item.oldCargoId) {
            await provisionCargoAcessosServer(sb, item.id, null, item.oldCargoId, sam, item.data.nome || "", item.data.email || "");
          }

          // Also remove resources from non-cargo profiles (manual/exception)
          const { data: otherAtribuicoes } = await sb.from("perfil_atribuicoes")
            .select("perfil_id")
            .eq("colaborador_id", item.id)
            .eq("ativo", true)
            .neq("origem", "cargo");
          if (otherAtribuicoes && otherAtribuicoes.length > 0) {
            for (const a of otherAtribuicoes) {
              await queueProfileAccess(sb, sam, item.data.nome || "", item.data.email || "", a.perfil_id, "remove");
            }
          }

          // Disable Entra ID account
          await sb.from("iam_queue").insert({
            action_type: "disable_entra",
            payload_json: {
              mail: item.data.email || "",
              samAccountName: sam,
              displayName: item.data.nome || "",
            },
            target_identity: sam,
            colaborador_id: item.id,
            requested_by: "importacao_csv",
            status: "pending",
          });
        } else if (isSoftDisable) {
          // Soft disable (férias/afastado): disable AD + Entra but KEEP all access
          await sb.from("iam_queue").insert({
            action_type: "disable",
            payload_json: {
              samAccountName: sam,
              mail: item.data.email || "",
              displayName: item.data.nome || "",
              status: "disabled",
              status_anterior: oldStatus,
              status_novo: newStatus,
              changed_fields: ["status"],
              new_values: { status: "disabled" },
            },
            target_identity: sam,
            colaborador_id: item.id,
            requested_by: "importacao_csv",
            status: "pending",
          });

          await sb.from("iam_queue").insert({
            action_type: "disable_entra",
            payload_json: {
              mail: item.data.email || "",
              samAccountName: sam,
              displayName: item.data.nome || "",
            },
            target_identity: sam,
            colaborador_id: item.id,
            requested_by: "importacao_csv",
            status: "pending",
          });
        } else if (isReactivating) {
          // Reactivating from disabled state: re-enable AD + Entra
          await sb.from("iam_queue").insert({
            action_type: "create_if_not_exists",
            payload_json: {
              samAccountName: sam,
              mail: item.data.email || "",
              displayName: item.data.nome || "",
              status: "enabled",
              status_anterior: oldStatus,
              status_novo: "ativo",
              changed_fields: ["status"],
              new_values: { status: "enabled" },
            },
            target_identity: sam,
            colaborador_id: item.id,
            requested_by: "importacao_csv",
            status: "pending",
          });

          await sb.from("iam_queue").insert({
            action_type: "enable_entra",
            payload_json: {
              mail: item.data.email || "",
              samAccountName: sam,
              displayName: item.data.nome || "",
            },
            target_identity: sam,
            colaborador_id: item.id,
            requested_by: "importacao_csv",
            status: "pending",
          });
        } else {
          // Build changed_fields for update
          const changedFields: string[] = [];
          const newValues: Record<string, string | null> = {};

          if (item.data.cargo_id !== item.oldCargoId) {
            changedFields.push("title");
            newValues.title = item.data.cargo_id ? (cargoNames.get(item.data.cargo_id) || null) : null;
          }
          if (item.data.area_id) {
            changedFields.push("department");
            newValues.department = areaNames.get(item.data.area_id) || null;
          }
          if (item.data.empresa_id) {
            changedFields.push("company");
            newValues.company = empresaNames.get(item.data.empresa_id) || null;
          }

          if (changedFields.length > 0) {
            await sb.from("iam_queue").insert({
              action_type: "update",
              payload_json: {
                samAccountName: sam,
                mail: item.data.email || "",
                displayName: item.data.nome || "",
                status: "enabled",
                changed_fields: changedFields,
                new_values: newValues,
              },
              target_identity: sam,
              colaborador_id: item.id,
              requested_by: "importacao_csv",
              status: "pending",
            });
          }

          // Gap 5: Re-provision profiles on cargo change
          if (item.data.cargo_id !== item.oldCargoId) {
            await provisionCargoAcessosServer(
              sb, item.id, item.data.cargo_id, item.oldCargoId,
              sam, item.data.nome || "", item.data.email || ""
            );
          }
        }
      }
    }

    // ── 11. Alert if leavers ──
    if (leaverMatriculas.length > 0) {
      await sb.from("alertas").insert({
        tipo: "remocao_csv",
        titulo: `${leaverMatriculas.length} colaborador(es) removido(s)`,
        mensagem: `Importação CSV removeu ${leaverMatriculas.length} colaborador(es) ausentes do arquivo.`,
        severidade: "info", ref_tipo: "sync_job", ref_id: jobId,
      });
    }

    // ── 12. Finalize ──
    await sb.from("sync_jobs").update({
      status: "done", phase: "done", colab_percent: 100,
      colab_created: created, colab_updated: updated, colab_quarentena: leaverMatriculas.length,
      message: `Concluído: ${created} novos, ${updated} atualizados, ${unchanged} inalterados, ${leaverMatriculas.length} removidos`,
    }).eq("id", jobId);

    await sb.from("auditoria").insert({
      entidade: "importacao_csv", acao: "importar",
      resumo: `CSV importado: ${totalRows} linhas → ${created} novos, ${updated} atualizados, ${leaverMatriculas.length} removidos`,
      detalhes: { filename, totalRows, created, updated, unchanged, removed: leaverMatriculas.length, jobId },
    });

    return { success: true, jobId, created, updated, unchanged, removed: leaverMatriculas.length, total: totalRows };
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
