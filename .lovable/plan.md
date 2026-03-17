

## Plano: Importacao CSV SharePoint como fonte oficial de colaboradores

### Analise do CSV

O arquivo `base_colab_2026-03-17.csv` tem 3874 registros com estas colunas:

| CSV Column | Mapeamento DB |
|---|---|
| `displayName` | `colaboradores.nome` |
| `mail` | `colaboradores.email` |
| `employID` | `colaboradores.matricula` |
| `Cadastro_Pessoa_Fisica` | `colaboradores.cpf` |
| `company` | lookup → `empresas.nome` → `colaboradores.empresa_id` |
| `title` / `description` | lookup → `cargos.nome` → `colaboradores.cargo_id` |
| `departmentNumber` | lookup → `areas` (precisa mapear) |
| `status` | mapeamento: Ativo→ativo, Demitido→desligado, Afastado→afastado, Férias→ferias |
| `Data_Admissao` | `colaboradores.data_admissao` |
| `Data_Rescisao` | `colaboradores.data_desligamento` |
| `manager` | lookup → `colaboradores.gestor_id` |
| `Base_Local` | lookup → `localidades.nome` → `colaboradores.localidade_id` |
| `sAMAccountName` | novo campo ou ignorar |

---

### Arquitetura

```text
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────┐
│  SharePoint CSV  │────▶│ sync-csv-colab (Edge)│────▶│  Supabase DB │
│  (ou upload)     │     │                      │     │              │
└─────────────────┘     │ 1. Parse CSV         │     │ snapshots    │
                        │ 2. Validar estrutura │     │ colaboradores│
                        │ 3. Snapshot atual    │     │ eventos_jml  │
                        │ 4. Diff (J/M/L)     │     │ alertas      │
                        │ 5. Upsert colab     │     │ auditoria    │
                        │ 6. Quarentena leaver │     │ sync_jobs    │
                        └──────────────────────┘     └──────────────┘
```

---

### 1. Database Migration

**Nova tabela `colab_snapshots`** — armazena cada importacao como snapshot para diff:
- `id`, `import_job_id` (ref sync_jobs), `matricula` (employID), `hash` (SHA-256 dos campos), `dados` (jsonb com todos os campos do CSV), `created_at`

**Alterar tabela `colaboradores`**:
- Adicionar coluna `import_hash text` — para detectar mudancas entre snapshots
- Adicionar coluna `ultima_importacao_id uuid` — ref ao sync_job que tocou o registro por ultimo

**Alterar tabela `sync_jobs`**:
- Adicionar colunas: `tipo text DEFAULT 'entra_id'` (valores: `entra_id`, `csv_colab`), `colab_quarentena int DEFAULT 0`, `colab_inativos int DEFAULT 0`, `filename text`

**Nova tabela `colab_quarentena`** — registros ausentes do CSV aguardando decisao:
- `id`, `colaborador_id`, `import_job_id`, `motivo text`, `status text DEFAULT 'pendente'` (pendente/confirmado/descartado), `decidido_por text`, `decidido_em timestamptz`, `created_at`

RLS: mesmas policies das demais tabelas (admin/operador write, all read).

---

### 2. Edge Function `sync-csv-colab`

Nova funcao server-side que:

1. **Recebe CSV** via body (upload manual) OU futuramente busca no SharePoint via Graph API (placeholder pronto com `SHAREPOINT_SITE_ID` e `SHAREPOINT_FOLDER_PATH` nos parametros)
2. **Cria sync_job** com `tipo='csv_colab'`, status `running`
3. **Parse CSV** — valida headers obrigatorios contra schema esperado
4. **Chave unica**: `employID` (matricula) como identificador de cada pessoa
5. **Para cada linha do CSV**:
   - Calcula hash SHA-256 de campos relevantes
   - Grava em `colab_snapshots`
6. **Diff com base atual** (colaboradores onde `origem='csv'`):
   - **Joiner**: matricula no CSV mas nao existe no DB → INSERT colaborador + evento JML tipo `joiner`
   - **Mover**: matricula existe mas hash diferente → UPDATE colaborador + evento JML tipo `mover` com `dados_antes`/`dados_depois`
   - **Leaver (quarentena)**: matricula no DB mas ausente no CSV → NAO desliga automaticamente, cria registro em `colab_quarentena` + evento JML tipo `leaver` com status `quarentena`
7. **Lookups automaticos**: empresa, cargo, area, localidade — cria se nao existir (upsert por nome)
8. **Gestor**: resolve por nome (`manager` column) apos importar todos
9. **Progresso**: atualiza `sync_jobs` a cada batch (sem timeout — processa tudo)
10. **Auditoria**: registra em `auditoria` com entidade `importacao_csv`
11. **Alertas**: cria alertas para quarentenas e erros

Config TOML: `verify_jwt = false`

---

### 3. Limpar Base Manual Existente

Acao administrativa na pagina de Integracoes:

- Botao "Limpar Base Manual" com dialog de confirmacao
- Marca colaboradores com `origem='manual'` ou `origem='entra_id'` como `status='inativo'` e `origem='obsoleto'` (soft delete, nao remove fisicamente)
- **Validacao**: nao altera colaboradores que tambem sao operadores (cross-check com tabela `operadores` por email)
- Registra em `auditoria` com todos os IDs afetados
- Cria alerta informativo

---

### 4. Frontend — Pagina de Integracoes

Refatorar `IntegracoesPage.tsx`:

- **Card Entra ID** (existente) — manter como esta
- **Novo Card "Importacao CSV Colaboradores"**:
  - Botao "Importar CSV" (upload manual como fallback)
  - Futuro: botao "Buscar do SharePoint" (desabilitado ate configurar credenciais)
  - Progresso via polling de `sync_jobs` onde `tipo='csv_colab'`
  - Resumo: joiners, movers, quarentenas
- **Novo Card "Limpar Base Anterior"**:
  - Botao com confirmacao dupla
  - Mostra quantos registros serao marcados como inativos

---

### 5. Frontend — Pagina de Quarentena

Nova sub-aba em Eventos JML ou pagina dedicada:

- Lista registros de `colab_quarentena` com status `pendente`
- Acoes: "Confirmar Desligamento" (muda colaborador para `desligado`) ou "Descartar" (mantem ativo)
- Cada acao registra auditoria

---

### 6. Ajustes em Paginas Existentes

- **ColaboradoresPage**: adicionar coluna "Origem" (csv, entra_id, manual, obsoleto) com badge colorido
- **Dashboard**: KPI de "Quarentenas Pendentes"; substituir dados mockados do grafico JML por dados reais agrupados por semana
- **Eventos JML**: a tab "Quarentena" ja existe — vai popular com eventos reais gerados pela importacao

---

### 7. Configuracoes (Parametros)

Adicionar parametros para configuracao futura do SharePoint:
- `sharepoint_site_id` — ID do site SharePoint
- `sharepoint_folder_path` — caminho da pasta dos CSVs
- `csv_colab_prefix` — prefixo do arquivo (default: `base_colab_`)

---

### Resumo de Arquivos

| Acao | Arquivo |
|---|---|
| Migration | Nova migration (colab_snapshots, colab_quarentena, alter colaboradores, alter sync_jobs) |
| Criar | `supabase/functions/sync-csv-colab/index.ts` |
| Editar | `supabase/config.toml` (adicionar funcao) |
| Editar | `src/hooks/useOrigoData.ts` (hooks para quarentena, snapshots) |
| Editar | `src/pages/configuracoes/IntegracoesPage.tsx` (cards CSV + limpar base) |
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` (coluna origem) |
| Editar | `src/pages/Dashboard.tsx` (KPI quarentena, dados reais no grafico) |
| Editar | `src/pages/eventos-jml/EventosJMLPage.tsx` (integracao com quarentena) |

### Ordem de Implementacao

1. Migration (tabelas + colunas)
2. Edge function `sync-csv-colab`
3. Frontend: IntegracoesPage (upload CSV + limpar base + progresso)
4. Frontend: ColaboradoresPage (coluna origem)
5. Frontend: Dashboard (KPIs reais)
6. Hooks e ajustes menores

