## Problema

Quando um colaborador é desligado **direto na ferramenta** (ColaboradoresPage / ColaboradorDetalhePage), o status no banco vira `desligado`/`inativo`. Porém o CSV de RH ainda traz esse mesmo colaborador como `ativo` por até 5 dias. No próximo `sync-csv-colab`, a lógica atual em `supabase/functions/sync-csv-colab/index.ts` (linha 829) interpreta isso como reativação:

```ts
const isReactivating = newStatus === "ativo"
  && oldStatus !== "ativo"
  && disabledStatuses.includes(oldStatus); // desligado/inativo/ferias/afastado
```

Resultado: o sync sobrescreve o status para `ativo` e enfileira `create_if_not_exists` + `enable_entra` — **reativando indevidamente** alguém que o admin acabou de desligar.

A "Suspensão Preventiva" já protege esse caso porque não muda o status no banco. Mas o **desligamento manual direto** (hard disable feito por admin/operador) hoje está desprotegido.

## Estratégia: marcar a origem do desligamento e travar a reativação por CSV

Adicionar um marcador "desligado manualmente na ferramenta" no colaborador. Enquanto esse marcador estiver ativo, o `sync-csv-colab` deve:

1. **Não atualizar** o `status` do banco com o valor do CSV.
2. **Não enfileirar** `enable_*` (nem `create_if_not_exists`).
3. **Registrar um alerta** quando o CSV tentar trazer o colaborador de volta para `ativo` (sinal informativo para o RH atualizar a planilha).

Quando o CSV finalmente refletir o desligamento (status vira `desligado`/`inativo`), o marcador é limpo automaticamente — o estado da ferramenta e da planilha convergiram, e dali pra frente o ciclo normal volta a valer (inclusive uma futura recontratação real via CSV poderá reativar normalmente).

## Comportamento por cenário

```text
Cenário A — Admin desliga na ferramenta, CSV ainda ativo
  DB: ativo → desligado (manual, flag=true)
  CSV chega "ativo":
    - status NÃO muda no banco (continua desligado)
    - nenhuma ação enable_* enfileirada
    - alerta "CSV ainda mostra X como ativo — RH precisa atualizar"

Cenário B — CSV finalmente reflete o desligamento
  DB: desligado (flag=true)   CSV: desligado/inativo
    - flag é limpa (convergência)
    - sem novas ações (já está desligado)

Cenário C — Recontratação legítima depois (CSV volta a "ativo")
  DB: desligado (flag=false)   CSV: ativo
    - segue o caminho normal de reativação existente
```

## Telas e UX

- **ColaboradorDetalhePage**: badge discreto "Desligado manualmente na ferramenta" quando a flag estiver ativa, e (se o CSV ainda trouxer como ativo) um aviso "Aguardando RH refletir o desligamento no CSV — gap de N dias".
- **AlertasPage**: novo tipo `csv_divergencia_desligamento` para divergências detectadas pelo sync.
- **Dashboard**: já existe a métrica de "gap" da suspensão preventiva — adicionamos a mesma noção para desligamentos manuais (linha extra na seção, sem nova tela).

## Detalhes técnicos

### Banco

- `colaboradores`: novas colunas
  - `desligado_manual boolean default false`
  - `desligado_manual_em timestamptz`
  - `desligado_manual_por text`
- GRANTs e RLS no padrão já existente (admin/operador write, authenticated read conforme regra atual).

### `src/lib/colaboradorLifecycle.ts` (handleStatusChange)

Quando `oldStatus === "ativo" && newStatus !== "ativo"` e o caminho é **hard disable** (`desligado`/`inativo`), setar `desligado_manual=true`, `desligado_manual_em=now()`, `desligado_manual_por=operadorEmail`. Soft disable (`ferias`/`afastado`) **não** seta a flag — esses são reversíveis e a planilha ainda manda.

Quando `oldStatus !== "ativo" && newStatus === "ativo"` (reativação manual pelo próprio admin na ferramenta), limpar a flag.

### `supabase/functions/sync-csv-colab/index.ts`

Trecho do bloco `for (const item of toUpdate)` (linhas ~820-944):

1. Carregar `desligado_manual` para os IDs do batch (uma única query).
2. **Antes** de fazer o `update` do status no banco a partir do CSV, se `desligado_manual===true` **e** `newStatus==='ativo'`:
   - Forçar `item.data.status = item.oldStatus` (não sobrescreve).
   - Pular o ramo `isReactivating`.
   - Registrar `logAlerta({ tipo: 'csv_divergencia_desligamento', severidade: 'aviso', mensagem: 'CSV trouxe X como ativo, mas foi desligado manualmente em DD/MM' })`.
3. Se `desligado_manual===true` **e** `newStatus` é `desligado`/`inativo`: limpar a flag (`desligado_manual=false`, demais campos null) — convergência.

### Reconciliação com Pré-Desligamento

A flag `desligado_manual` é **independente** de `suspenso_preventivo`:
- Pré-desligamento: status continua `ativo`, suspende sign-in, espera CSV. Não precisa de guard novo (já tratado).
- Desligamento manual hard: status vira `desligado`, flag liga, guard impede reativação pelo CSV.

Se um colaborador tem `suspenso_preventivo=true` e depois o admin formaliza o desligamento direto na ferramenta (sem esperar CSV), o `handleStatusChange` já limpa `suspenso_preventivo` (lógica existente) e agora também liga `desligado_manual`.

### Auditoria

Cada bloqueio de reativação pelo guard gera entrada em `auditoria` com `acao='bloquear_reativacao_csv'` e detalhes (CSV status, DB status, flag, data do desligamento manual).

## Fora do escopo

- Mudar o contrato/origem do CSV.
- Expirar a flag automaticamente (ex.: após 30 dias). Caso o CSV nunca convirja, o operador pode forçar manualmente reativando o colaborador na ferramenta (a flag é limpa nesse caminho).
- Bloqueio de outras ações vindas do CSV (cargo/área) enquanto a flag está ativa — o pedido é especificamente sobre não reativar.

## Resultado esperado

Desligamento manual na ferramenta vira a fonte da verdade até o CSV convergir. O sync passa a ser idempotente nesse intervalo: lê, detecta divergência, alerta, e **nunca** reativa silenciosamente.
