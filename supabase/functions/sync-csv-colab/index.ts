import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CsvRow {
  cn: string;
  company: string;
  description: string;
  displayName: string;
  employID: string;
  departmentNumber: string;
  givenName: string;
  L: string;
  mail: string;
  manager: string;
  name: string;
  physicalDeliveryOfficeName: string;
  sAMAccountName: string;
  sn: string;
  title: string;
  status: string;
  Cadastro_Pessoa_Fisica: string;
  Data_Nascimento: string;
  Data_Admissao: string;
  Bairro: string;
  CEP: string;
  Cidade: string;
  Complemento: string;
  Estado: string;
  Numero_Endereco: string;
  Rua: string;
  Base_Local: string;
  Data_Rescisao: string;
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
  afastado: "afastado",
  "férias": "ferias",
  ferias: "ferias",
  inativo: "inativo",
};

function normalizeHeader(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, " ")
    .trim();
}

function findHeaderMatch(headers: string[], target: string): string | null {
  const normTarget = normalizeHeader(target);
  // Exact match first
  const exact = headers.find((h) => h === target);
  if (exact) return exact;
  // Normalized match
  const norm = headers.find((h) => normalizeHeader(h) === normTarget);
  if (norm) return norm;
  // Contains match
  const contains = headers.find((h) => normalizeHeader(h).includes(normTarget));
  if (contains) return contains;
  return null;
}

function parseCsv(text: string): CsvRow[] {
  // Strip BOM if present
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV vazio ou sem dados");

  const rawHeaders = lines[0].split(";").map((h) => h.trim().replace(/^"|"$/g, ""));

  // Build a mapping from required name -> actual header name
  const headerMap: Record<string, string> = {};
  const missing: string[] = [];
  for (const req of REQUIRED_HEADERS) {
    const match = findHeaderMatch(rawHeaders, req);
    if (match) {
      headerMap[req] = match;
    } else {
      missing.push(req);
    }
  }

  if (missing.length > 0)
    throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}. Headers encontrados: ${rawHeaders.slice(0, 10).join(", ")}`);

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(";").map((v) => v.trim().replace(/^"|"$/g, ""));
    if (values.length < headers.length) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    if (!row.employID) continue;
    rows.push(row as unknown as CsvRow);
  }
  return rows;
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hashFields(row: CsvRow): string {
  const key = [
    row.displayName,
    row.mail,
    row.company,
    row.title,
    row.departmentNumber,
    row.status,
    row.Data_Admissao,
    row.Data_Rescisao,
    row.Base_Local,
    row.manager,
    row.Cadastro_Pessoa_Fisica,
  ].join("|");
  return key;
}

function parseDate(d: string): string | null {
  if (!d || d === "NULL" || d === "") return null;
  // Try dd/mm/yyyy
  const parts = d.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  // Try yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  let jobId: string | null = null;

  try {
    // ── 1. Read CSV from body ──
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

    // ── 2. Create sync_job ──
    const { data: job, error: jobErr } = await sb
      .from("sync_jobs")
      .insert({
        status: "running",
        tipo: "csv_colab",
        message: "Iniciando importação CSV...",
        phase: "parsing",
        filename,
      })
      .select()
      .single();
    if (jobErr) throw jobErr;
    jobId = job.id;

    // ── 3. Parse CSV ──
    const rows = parseCsv(csvText);
    const totalRows = rows.length;

    await sb
      .from("sync_jobs")
      .update({
        message: `Parsed ${totalRows} registros. Processando...`,
        phase: "processing",
        colab_total: totalRows,
      })
      .eq("id", jobId);

    // ── 4. Build lookup caches ──
    const empresaCache = new Map<string, string>();
    const areaCache = new Map<string, string>();
    const cargoCache = new Map<string, string>();
    const localCache = new Map<string, string>();

    // Pre-load existing
    const [empresas, areas, cargos, locais] = await Promise.all([
      sb.from("empresas").select("id, nome"),
      sb.from("areas").select("id, nome, empresa_id"),
      sb.from("cargos").select("id, nome"),
      sb.from("localidades").select("id, nome, empresa_id"),
    ]);
    (empresas.data || []).forEach((e: any) =>
      empresaCache.set(e.nome.toLowerCase(), e.id)
    );
    (areas.data || []).forEach((a: any) =>
      areaCache.set(a.nome.toLowerCase(), a.id)
    );
    (cargos.data || []).forEach((c: any) =>
      cargoCache.set(c.nome.toLowerCase(), c.id)
    );
    (locais.data || []).forEach((l: any) =>
      localCache.set(l.nome.toLowerCase(), l.id)
    );

    // Helper to get or create lookup entries
    async function getOrCreateEmpresa(nome: string): Promise<string | null> {
      if (!nome || nome === "NULL") return null;
      const key = nome.toLowerCase();
      if (empresaCache.has(key)) return empresaCache.get(key)!;
      const { data } = await sb
        .from("empresas")
        .upsert({ nome }, { onConflict: "nome" })
        .select("id")
        .single();
      if (data) {
        empresaCache.set(key, data.id);
        return data.id;
      }
      // Fallback: insert
      const { data: ins } = await sb
        .from("empresas")
        .insert({ nome })
        .select("id")
        .single();
      if (ins) empresaCache.set(key, ins.id);
      return ins?.id || null;
    }

    async function getOrCreateArea(
      nome: string,
      empresaId: string | null
    ): Promise<string | null> {
      if (!nome || nome === "NULL") return null;
      const key = nome.toLowerCase();
      if (areaCache.has(key)) return areaCache.get(key)!;
      const { data: existing } = await sb
        .from("areas")
        .select("id")
        .eq("nome", nome)
        .limit(1)
        .maybeSingle();
      if (existing) {
        areaCache.set(key, existing.id);
        return existing.id;
      }
      const { data: ins } = await sb
        .from("areas")
        .insert({ nome, empresa_id: empresaId || "00000000-0000-0000-0000-000000000000" })
        .select("id")
        .single();
      if (ins) areaCache.set(key, ins.id);
      return ins?.id || null;
    }

    async function getOrCreateCargo(nome: string): Promise<string | null> {
      if (!nome || nome === "NULL") return null;
      const key = nome.toLowerCase();
      if (cargoCache.has(key)) return cargoCache.get(key)!;
      const { data: existing } = await sb
        .from("cargos")
        .select("id")
        .eq("nome", nome)
        .limit(1)
        .maybeSingle();
      if (existing) {
        cargoCache.set(key, existing.id);
        return existing.id;
      }
      const { data: ins } = await sb
        .from("cargos")
        .insert({ nome })
        .select("id")
        .single();
      if (ins) cargoCache.set(key, ins.id);
      return ins?.id || null;
    }

    async function getOrCreateLocal(
      nome: string,
      empresaId: string | null
    ): Promise<string | null> {
      if (!nome || nome === "NULL") return null;
      const key = nome.toLowerCase();
      if (localCache.has(key)) return localCache.get(key)!;
      const { data: existing } = await sb
        .from("localidades")
        .select("id")
        .eq("nome", nome)
        .limit(1)
        .maybeSingle();
      if (existing) {
        localCache.set(key, existing.id);
        return existing.id;
      }
      const { data: ins } = await sb
        .from("localidades")
        .insert({ nome, empresa_id: empresaId || "00000000-0000-0000-0000-000000000000" })
        .select("id")
        .single();
      if (ins) localCache.set(key, ins.id);
      return ins?.id || null;
    }

    // ── 5. Load existing CSV colaboradores ──
    const { data: existingColabs } = await sb
      .from("colaboradores")
      .select("id, matricula, import_hash, nome, email, status, empresa_id, cargo_id, area_id, localidade_id, gestor_id, cpf, data_admissao, data_desligamento")
      .eq("origem", "csv");
    const existingMap = new Map<string, any>();
    (existingColabs || []).forEach((c: any) => {
      if (c.matricula) existingMap.set(c.matricula, c);
    });

    // ── 6. Process rows in batches ──
    let created = 0;
    let updated = 0;
    let quarentenaCount = 0;
    const csvMatriculas = new Set<string>();
    const BATCH_SIZE = 50;

    // Collect snapshot batch
    const snapshotBatch: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const matricula = row.employID.trim();
      if (!matricula) continue;
      csvMatriculas.add(matricula);

      const rawHash = hashFields(row);
      const hash = await sha256(rawHash);

      // Save snapshot
      snapshotBatch.push({
        import_job_id: jobId,
        matricula,
        hash,
        dados: row,
      });

      // Flush snapshots in batches
      if (snapshotBatch.length >= BATCH_SIZE) {
        await sb.from("colab_snapshots").insert(snapshotBatch);
        snapshotBatch.length = 0;
      }

      // Lookups
      const empresaId = await getOrCreateEmpresa(row.company);
      const cargoId = await getOrCreateCargo(row.title || row.description);
      const areaId = await getOrCreateArea(row.departmentNumber, empresaId);
      const localId = await getOrCreateLocal(row.Base_Local, empresaId);
      const statusMapped =
        STATUS_MAP[(row.status || "ativo").toLowerCase()] || "ativo";

      const colabData: Record<string, any> = {
        nome: row.displayName,
        email: row.mail || null,
        matricula,
        cpf: row.Cadastro_Pessoa_Fisica || null,
        empresa_id: empresaId,
        cargo_id: cargoId,
        area_id: areaId,
        localidade_id: localId,
        status: statusMapped,
        data_admissao: parseDate(row.Data_Admissao),
        data_desligamento: parseDate(row.Data_Rescisao),
        origem: "csv",
        import_hash: hash,
        ultima_importacao_id: jobId,
      };

      const existing = existingMap.get(matricula);
      if (!existing) {
        // JOINER
        const { data: newColab } = await sb
          .from("colaboradores")
          .insert(colabData)
          .select("id")
          .single();
        if (newColab) {
          created++;
          await sb.from("eventos_jml").insert({
            tipo: "joiner",
            colaborador_id: newColab.id,
            colaborador_nome: row.displayName,
            status: "pendente",
            origem: "importacao_csv",
            dados_depois: row,
          });
        }
      } else if (existing.import_hash !== hash) {
        // MOVER
        await sb
          .from("colaboradores")
          .update(colabData)
          .eq("id", existing.id);
        updated++;

        // Build dados_antes from existing fields
        const dadosAntes: Record<string, any> = {};
        for (const k of Object.keys(colabData)) {
          if (k !== "import_hash" && k !== "ultima_importacao_id" && k !== "origem") {
            dadosAntes[k] = existing[k] ?? null;
          }
        }

        await sb.from("eventos_jml").insert({
          tipo: "mover",
          colaborador_id: existing.id,
          colaborador_nome: row.displayName,
          status: "pendente",
          origem: "importacao_csv",
          dados_antes: dadosAntes,
          dados_depois: row,
        });
      } else {
        // No change — just update ultima_importacao_id
        await sb
          .from("colaboradores")
          .update({ ultima_importacao_id: jobId })
          .eq("id", existing.id);
      }

      // Progress update every batch
      if ((i + 1) % BATCH_SIZE === 0 || i === rows.length - 1) {
        const pct = Math.round(((i + 1) / totalRows) * 100);
        await sb
          .from("sync_jobs")
          .update({
            colab_percent: pct,
            colab_created: created,
            colab_updated: updated,
            colab_quarentena: quarentenaCount,
            message: `Processando ${i + 1}/${totalRows}...`,
          })
          .eq("id", jobId);
      }
    }

    // Flush remaining snapshots
    if (snapshotBatch.length > 0) {
      await sb.from("colab_snapshots").insert(snapshotBatch);
    }

    // ── 7. Detect LEAVERS (quarentena) ──
    await sb
      .from("sync_jobs")
      .update({ phase: "quarentena", message: "Verificando ausências..." })
      .eq("id", jobId);

    for (const [matricula, existing] of existingMap.entries()) {
      if (
        !csvMatriculas.has(matricula) &&
        existing.status !== "desligado" &&
        existing.status !== "inativo"
      ) {
        quarentenaCount++;
        await sb.from("colab_quarentena").insert({
          colaborador_id: existing.id,
          import_job_id: jobId,
          motivo: "ausente_no_csv",
        });
        await sb.from("eventos_jml").insert({
          tipo: "leaver",
          colaborador_id: existing.id,
          colaborador_nome: existing.nome,
          status: "quarentena",
          origem: "importacao_csv",
          dados_antes: existing,
        });
      }
    }

    // ── 8. Resolve gestores by name ──
    await sb
      .from("sync_jobs")
      .update({ phase: "gestores", message: "Resolvendo gestores..." })
      .eq("id", jobId);

    // Build name→id map from all CSV colaboradores
    const { data: allCsvColabs } = await sb
      .from("colaboradores")
      .select("id, nome")
      .eq("origem", "csv");
    const nameToId = new Map<string, string>();
    (allCsvColabs || []).forEach((c: any) =>
      nameToId.set(c.nome.toLowerCase(), c.id)
    );

    for (const row of rows) {
      if (!row.manager || row.manager === "NULL") continue;
      const gestorId = nameToId.get(row.manager.toLowerCase());
      if (gestorId) {
        await sb
          .from("colaboradores")
          .update({ gestor_id: gestorId })
          .eq("matricula", row.employID)
          .eq("origem", "csv");
      }
    }

    // ── 9. Finalize ──
    await sb
      .from("sync_jobs")
      .update({
        status: "done",
        phase: "done",
        colab_percent: 100,
        colab_created: created,
        colab_updated: updated,
        colab_quarentena: quarentenaCount,
        message: `Concluído: ${created} novos, ${updated} atualizados, ${quarentenaCount} em quarentena`,
      })
      .eq("id", jobId);

    // Auditoria
    await sb.from("auditoria").insert({
      entidade: "importacao_csv",
      acao: "importar",
      resumo: `CSV importado: ${totalRows} linhas, ${created} novos, ${updated} atualizados, ${quarentenaCount} quarentena`,
      detalhes: { filename, totalRows, created, updated, quarentenaCount, jobId },
    });

    // Alertas
    if (quarentenaCount > 0) {
      await sb.from("alertas").insert({
        tipo: "quarentena_csv",
        titulo: `${quarentenaCount} colaborador(es) em quarentena`,
        mensagem: `Importação CSV detectou ${quarentenaCount} colaborador(es) ausentes do arquivo. Verifique na tela de Eventos JML.`,
        severidade: "aviso",
        ref_tipo: "sync_job",
        ref_id: jobId,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        created,
        updated,
        quarentena: quarentenaCount,
        total: totalRows,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("sync-csv-colab error:", msg);

    if (jobId) {
      await sb
        .from("sync_jobs")
        .update({ status: "error", error: msg, message: `Erro: ${msg}` })
        .eq("id", jobId);
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
