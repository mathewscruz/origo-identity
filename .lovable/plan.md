
## Objetivo

Na página **Aprovação IAM**, tornar visível na própria linha da tabela — sem abrir o drawer — *o que está divergente* e *o que a aprovação vai executar*, para que o admin decida em segundos.

Hoje a linha só mostra `action_type`, `target_identity`, `payload_json` resumido genérico (`rule, scope, ad_status`) e origem. Toda a informação útil (Base vs Entra, motivo, conta órfã, etc.) só aparece depois do clique.

## Mudanças (todas em `src/pages/AprovacaoIAMPage.tsx`, camada de apresentação)

### 1. Nova coluna "Divergência / Motivo"
Substituir a coluna atual **Detalhe** (que renderiza `summarizePayload` — pouco útil, mostra só chaves) por uma coluna **Divergência** que interpreta o `payload_json` e o `action_type` e produz um chip semântico + texto humano.

Regras de renderização (função `renderDivergence(item)`):

- **`payload_json.reason === "status_divergence"`** →
  Chip âmbar `Status divergente` + texto: `Base: {colab_status} → Entra: {habilitado|desabilitado}`.
  Se `action_type` começa com `enable_`: seta verde "→ Habilitar". Se `disable_`: seta vermelha "→ Desabilitar". Se `sync_status_from_ad`: cinza "→ Sincronizar status do AD".
- **`action_type === "review_orphan_entra"`** →
  Chip azul `Conta órfã no Entra` + `Sem match na base` + data de criação se existir.
- **`action_type` in (`assign_group`,`remove_group`)** →
  Chip + `{+|−} grupo: {groupName}`.
- **`assign_license`/`remove_license`** → `{+|−} licença: {licenseName || skuPartNumber}`.
- **`assign_app`/`remove_app`/`create_user_app`/`update_user_app`/`disable_user_app`/`delete_user_app`** → `App: {appName}` + verbo curto.
- **`create`/`create_if_not_exists`** → `Criar {displayName || mail}` + destino (`AD` / `Entra`).
- **`update`/`update_entra`** → lista compacta dos campos que mudam (chaves do payload diferentes de identificadores), ex.: `cargo, area, manager`.
- **`disable`/`disable_entra`** → motivo se houver (`payload_json.reason`), ex.: `Leaver`, `Pré-desligamento`, `Reconciliação`.
- Fallback: reutiliza `summarizePayload` atual.

Cada chip usa a paleta semântica já existente (`bg-amber-100 text-amber-800…`, `bg-blue-100…`, verde/vermelho para add/remove). Nada de cor hardcoded fora dos tokens já usados no arquivo.

### 2. Coluna "Alvo" enriquecida
Além do `target_identity` (mono), mostrar em segunda linha o `payload_json.displayName` ou `mail` quando existir. Assim o admin vê `marianna.vidal` + `Marianna Vidal <marianna.vidal@origoenergia.com.br>`.

### 3. Badges de contexto ao lado da ação
Na célula **Ação**, ao lado do badge principal, adicionar mini-badges quando aplicável:
- `AD` ou `Entra` ou `App externo` (derivado do `action_type`).
- `Leaver`, `Pré-desligamento`, `Reconciliação`, `JML`, `Manual` (derivado de `requested_by` / `payload_json.reason`).

### 4. Destaque de linhas que exigem atenção
Aplicar leve tinta de fundo na linha conforme severidade:
- Destrutivas (`disable*`, `remove_*`, `delete_*`): `bg-red-50/40 hover:bg-red-50/70`.
- Órfãs / status_divergence: `bg-amber-50/40`.
- Criação/atribuição: sem tinta (padrão).

### 5. Filtro rápido "Somente divergências / destrutivas"
Adicionar um `Toggle`/`Button` na barra de filtros: **"Só ações críticas"** — filtra client-side por `action_type` destrutivo OU `payload_json.reason === "status_divergence"` OU `review_orphan_entra`. Reusa o estado já paginado (sem nova query).

### 6. Agrupamento visual por alvo (opcional, leve)
Quando várias linhas consecutivas têm o mesmo `target_identity`, adicionar um separador sutil com contador `{n} ações para {target}`. Feito puramente no render, sem mudar a query. Se ficar visualmente pesado na revisão, removemos.

## Fora de escopo
- Nenhuma mudança em Edge Functions, migrations, RLS, mutations de aprovar/recusar.
- Nenhuma mudança de comportamento no drawer de detalhe (fica como fallback rico).
- Nenhuma mudança na fila / execução.

## Arquivos tocados
- `src/pages/AprovacaoIAMPage.tsx` (única alteração — helpers `renderDivergence`, `contextBadges`, `rowTone` + ajuste do `<TableHeader>`/`<TableRow>` + toggle "Só ações críticas").

## Validação
- `npm run build` deve passar.
- Verificação visual via Playwright na rota `/aprovacao-iam` autenticado (screenshots antes/depois) confirmando: chip de divergência visível, cor de linha para destrutivas, toggle funcional.
