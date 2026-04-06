

## Diagnostico: Solicitacoes falharam no agente PowerShell

### Situacao atual

O sistema importou seu usuario corretamente e gerou **3 solicitacoes** na fila:

| action_type | status | error_code | result_message |
|---|---|---|---|
| `create_if_not_exists` | failed | AD_AGENT_ERROR | "action_type invalido: create_if_not_exists" |
| `assign_group` | failed | AD_AGENT_ERROR | "action_type invalido: assign_group" |
| `assign_license` | failed | AD_AGENT_ERROR | "action_type invalido: assign_license" |

Os payloads estao **corretos e completos**:
- `assign_group` → grupo "TI - INFRA N1 MANAGERS" (entra_id: `00c5e54e-577d-49fb-bddb-e9bbd49c9087`)
- `assign_license` → licenca "SPE_E3" (sku_id: `05e9a617-0261-4cee-bb44-138d3ef5d965`)

### Causa raiz

O agente PowerShell so reconhece `create`, `update`, `disable`, `delete`. Os novos tipos (`create_if_not_exists`, `assign_group`, `assign_license`) nao estao implementados no script do agente.

Alem disso, o retry nao recolocou as solicitacoes na fila porque `AD_AGENT_ERROR` nao esta na lista de erros retentaveis.

### Correcoes necessarias

#### 1. Adicionar `AD_AGENT_ERROR` a lista de erros retentaveis (iam-agent-api)

Na edge function, adicionar `"AD_AGENT_ERROR"` ao array `RETRYABLE_ERRORS`. Isso permite que quando o agente for atualizado, as solicitacoes sejam reprocessadas automaticamente.

#### 2. Recolocar as 3 solicitacoes na fila

Atualizar as 3 entradas com `status = 'pending'`, `error_code = null`, `retry_count = 0` para que voltem a ser entregues ao agente.

#### 3. Voce precisa atualizar o agente PowerShell

O script PowerShell no seu servidor precisa tratar os seguintes `action_type`:

- **`create_if_not_exists`**: Verificar se o usuario ja existe no AD (por `samAccountName`). Se existir, retornar sucesso. Se nao, criar.
- **`assign_group`**: Chamar Microsoft Graph para adicionar o usuario ao grupo do Entra ID usando `groupId` do payload.
- **`assign_license`**: Chamar Microsoft Graph para atribuir a licenca usando `skuId` do payload.
- **`remove_group`**: Remover usuario do grupo no Entra ID.
- **`remove_license`**: Remover licenca do usuario no Entra ID.

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Editar | `supabase/functions/iam-agent-api/index.ts` — adicionar `AD_AGENT_ERROR` aos erros retentaveis |
| Script SQL | Reset das 3 solicitacoes para `pending` |

