
## Diagnóstico

Todas as 49 linhas na tela são `sync_status_from_ad` vindas do `origo_agent_ad_status_reconcile`. Meu `DivergenceCell` atual não trata esse `action_type`, então cai no fallback e volta a mostrar `rule, scope, ad_status` — exatamente o que o usuário reclamou.

O payload real desses itens tem informação riquíssima que precisa aparecer:

- `iam_status` (base IAM): `ativo` / `inativo`
- `ad_status`: `ativo` / `inativo` (derivado do UAC do AD)
- `status_anterior` → `status_novo` (o que será gravado)
- `target_status` (status final)
- `matched_ad[].dn` — mostra a OU (`OU=Bloqueados`… é um sinal muito forte)
- `colaboradores[]` — nome real, matrícula, origem, status atual na base
- `changed_fields` — o que muda

## Mudança (única, em `src/pages/AprovacaoIAMPage.tsx`)

### 1. Handler dedicado para `sync_status_from_ad` no `DivergenceCell`

Renderizar, sem clicar:

```
[Status divergente]  Base IAM: ativo  ≠  AD: inativo   →  aplicar: inativo
Colaborador: Valeria Maria Pereira (mat. 3939, CSV)
OU: Bloqueados
```

- Chip âmbar `Status divergente` (ícone AlertTriangle).
- Linha "Base IAM: **X** ≠ AD: **Y** → aplicar: **Z**" com cores: verde para `ativo`, vermelho para `inativo`.
- Segunda linha com nome real + matrícula + origem (`CSV`/`entra`) — vem de `payload.colaboradores[0]`.
- Terceira linha extrai a OU do `matched_ad[0].dn` (regex `OU=([^,]+)`) e destaca:
  - Se OU contém `Bloqueados`/`Disabled` → chip vermelho `OU: Bloqueados`.
  - Caso contrário → texto discreto `OU: {nome}`.
- Se houver múltiplos colaboradores no grupo (duplicados por CPF), mostrar `+N duplicados` como chip cinza — sinaliza caso que merece análise humana.

### 2. Escopo/contexto correto no badge de contexto

Hoje `contextBadges` classifica `sync_status_from_ad` como escopo `IAM`. Ajustar `actionScope` para retornar `AD` nesse caso (a ação sincroniza a base *a partir* do AD). E adicionar um badge `Agente AD` quando `requested_by === "origo_agent_ad_status_reconcile"` (mais legível que "Reconciliação" genérica).

### 3. Rótulo do `action_type` em português

Adicionar em `actionLabels`:
- `sync_status_from_ad: "Sincronizar status ← AD"`

Assim o chip principal também comunica a direção.

### 4. Tinta de linha para `sync_status_from_ad` que desativa

Em `rowTone`, quando `payload.target_status === "inativo"` ou `"desligado"`, aplicar a tinta âmbar (é destrutivo do ponto de vista do usuário — vai desativar acesso). Ativações ficam sem tinta.

### 5. Fallback genérico melhorado

Quando nada bate, em vez de listar chaves cruas (`rule, scope, ad_status`), renderizar os campos mais informativos do payload em pares `chave: valor` (whitelist: `reason`, `status_anterior`, `status_novo`, `target_status`, `groupName`, `licenseName`, `appName`, `displayName`, `mail`, `dn`), pulando os ruidosos (`rule`, `scope`, `changed_fields`, `matched_ad`, `colaboradores`).

## Fora de escopo
- Nada de backend, migration, edge function, mutation.
- Nenhuma mudança no drawer de detalhe.

## Validação
- `tsgo --noEmit` limpo.
- Playwright em `/aprovacao-iam` com sessão injetada: screenshot da tabela mostrando "Base IAM: ativo ≠ AD: inativo → aplicar: inativo", nome real do colaborador e chip `OU: Bloqueados` visíveis sem hover/clique.
