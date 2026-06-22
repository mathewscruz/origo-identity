## Diagnóstico

Validei `LicencasPage.tsx`, `sync-entra-licencas` e os dados reais em `entra_licencas`. Encontrei 6 problemas concretos:

### 1. `total` ignora unidades em warning/suspended (Microsoft)
`sync-entra-licencas` lê apenas `prepaidUnits.enabled`. A Microsoft expõe também `warning` (licenças expiradas em período de graça, ainda atribuíveis) e `suspended` (canceladas, não atribuíveis). Hoje SKUs em graça aparecem como `total = 0` mesmo com usuários ativos atribuídos → `em_uso > total`.

Exemplo real no tenant: `EXCHANGEARCHIVE_ADDON` 209/118, `POWER_BI_PRO` 35/30 — over-subscribed visualmente, mas a causa é underreport de `total`.

### 2. SKUs "virais"/trial poluem o inventário e quebram o card "Críticas"
SKUs como `FLOW_FREE`, `POWER_BI_STANDARD`, `CCIBOTS_PRIVPREV_VIRAL`, `Dynamics_365_*_Viral_Trial`, `FORMS_PRO` chegam com `total = 10000` ou `1.000.000` (pool sintético da Microsoft). Eles:
- Inflam o contador "Microsoft" (≈40 SKUs sendo que <15 são pagos),
- Nunca disparam alerta "Crítico (≥90%)",
- Mascaram licenças realmente pagas que precisam de atenção.

### 3. Nome técnico exibido em vez de nome amigável
Mostra `CCIBOTS_PRIVPREV_VIRAL`, `DYN365_ENTERPRISE_CUSTOMER_SERVICE`. Usuário de negócio não reconhece. Microsoft publica o mapa `skuPartNumber → friendlyName` (ex.: `ENTERPRISEPACK` → "Office 365 E3").

### 4. `em_uso` de licenças externas é 100% manual
A tabela `licencas` (externas) tem `em_uso` como campo livre. Não há reconciliação com `iam_queue` (`action_type = 'assign_license'`, status `success`). Qualquer número ali é "verdade declarada", não medida.

### 5. Card "Críticas" usa `>= 90%` mas exibe rótulo "<10% disp."
Coerente matematicamente, mas o limite é fixo em código (sem parâmetro) e ignora SKUs com `total = 0` (trial sem pool).

### 6. Barra de progresso satura silenciosamente quando `em_uso > total`
`Progress value={pct}` com `pct > 100` apenas trava em 100%. Não há badge "Excedido" nem destaque visual diferente de "Crítico".

---

## Mudanças propostas

### A. `supabase/functions/sync-entra-licencas/index.ts`
- `total = (prepaidUnits.enabled ?? 0) + (prepaidUnits.warning ?? 0)` (inclui graça, exclui suspended).
- Adicionar colunas `capability_status` (`Enabled`/`Warning`/`Suspended`) e `friendly_name` no payload upsert.
- Filtrar/marcar SKUs com `appliesTo !== 'User'` ou `capabilityStatus = 'Suspended'` como ocultos do inventário operacional.

### B. Migração: enriquecer `entra_licencas`
```sql
ALTER TABLE public.entra_licencas
  ADD COLUMN IF NOT EXISTS friendly_name text,
  ADD COLUMN IF NOT EXISTS capability_status text,
  ADD COLUMN IF NOT EXISTS is_trial boolean DEFAULT false;
```
`is_trial` calculado no sync: `true` quando `skuPartNumber` contém `VIRAL|TRIAL|FREE|vTrial` **ou** `prepaidUnits.enabled >= 10000` e `consumedUnits < total*0.01`.

### C. Mapa de friendly names
Novo `supabase/functions/_shared/m365SkuNames.ts` com os ~80 SKUs mais comuns (Microsoft publica a lista oficial). Fallback: `skuPartNumber`.

### D. `LicencasPage.tsx`
1. Exibir `friendly_name || nome` como título; `nome` (SKU) vira subtítulo em `text-xs text-muted-foreground`.
2. Novo toggle "Ocultar trials/free" (default **ligado**). Filtra `is_trial = true`.
3. Card "Críticas" passa a contar apenas `total > 0 && !is_trial && pct >= 90`.
4. Quando `em_uso > total`: Badge "Excedido" vermelho ao lado do nome + barra com `pct = 100` em destructive + texto `+{em_uso - total} acima`.
5. Adicionar 2 contadores agregados de seats (não apenas SKUs):
   - "Seats totais (pagas)": `Σ total` excluindo trials.
   - "Seats em uso (pagas)": `Σ em_uso` excluindo trials.

### E. Reconciliação de `em_uso` para licenças **externas**
Substituir o input manual por valor calculado:
```
em_uso_calc = count(distinct colaborador_id) em iam_queue
              WHERE action_type = 'assign_license'
                AND status = 'success'
                AND payload_json->>'skuId' = licencas.id  (ou licenca_id ref)
```
Como `licencas` (externas) não tem SKU Microsoft, o vínculo precisa ser por `licenca_id` no payload. Adicionar:
- Coluna `licenca_id_externa` no payload de `assign_license` quando origem = externa.
- View `public.licencas_externas_uso` que retorna `licenca_id, em_uso_calc`.
- Card mostra `em_uso_calc` e indica "manual" apenas se não houver assignments rastreados.

### F. Parâmetro do limiar "Crítico"
Mover `90` para `parametros` (`licenca_critico_pct`, default 90). Lê via `useParametros`.

---

## Detalhes técnicos

- O sync não muda contrato com a UI (mesmo `useEntraLicencas`), só adiciona campos novos.
- `is_trial` é computado server-side a cada sync — não precisa backfill manual.
- Migração não altera RLS existente (mantém `authenticated SELECT` na tabela).
- View `licencas_externas_uso` com `security_invoker=on`.

---

## Fora de escopo (confirmar depois)

- Histórico de consumo (séries temporais) — feature nova, não fix.
- Alerta de renovação próxima — já existe campo `renovacao`, mas dashboard de alertas é outra frente.
- Custo total / forecast — depende de `custo_unitario` preenchido em todas as externas.

Confirma que sigo com A–F nessa ordem?
