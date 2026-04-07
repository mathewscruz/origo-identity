

## Plano: Sincronização simultânea AD + Entra ID para usuários existentes

### Situação atual

O sistema já envia ações para AD e Entra ID simultaneamente para **ativação/desativação** (ex: `disable` + `disable_entra`, `update` + `enable_entra`). Porém há uma lacuna:

**Alterações de área/cargo:** Quando muda departamento ou cargo de um colaborador, apenas um `update` (AD) é enviado. Não há ação correspondente no Entra ID para atualizar os atributos `department`/`jobTitle` diretamente via Graph API.

### O que precisa mudar

**1. Criar ação `update_entra`** — nova action_type no `process-iam-queue` que usa `PATCH /users/{id}` na Graph API para atualizar atributos como `department`, `jobTitle`, `companyName` diretamente no Entra ID, sem depender da replicação do AD local.

**2. Enfileirar `update_entra` junto com `update` (AD)** em todos os pontos onde alterações de atributos ocorrem para usuários existentes:
- `ColaboradoresPage.tsx` — edição de cargo/área
- `ColaboradorDetalhePage.tsx` — edição via dialog
- `TerceirosPage.tsx` — edição
- `TerceiroDetalhePage.tsx` — edição

**3. Para criação de novos usuários:** manter comportamento atual — o sistema cria no AD e as ações Entra usam o mecanismo de retry com backoff exponencial (5min, 10min, 20min...) até o usuário ser replicado. Nenhuma mudança necessária aqui.

### Detalhes técnicos

**Nova action `update_entra` no `process-iam-queue`:**
```text
case "update_entra":
  PATCH /users/{userId}
  body: { department, jobTitle, companyName } (campos do payload)
```

**Pontos de enfileiramento (somente para edições, não criação):**
Após cada `action_type: "update"` (AD), inserir também um `action_type: "update_entra"` com os mesmos campos alterados, usando `email || sam` como `target_identity`.

**Registrar nos labels da UI:** Adicionar `update_entra` nos mapas de labels em `Dashboard.tsx`, `FilaProvisionamentoPage.tsx` e `ColaboradorDetalhePage.tsx`.

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `supabase/functions/process-iam-queue/index.ts` — adicionar `update_entra` ao `ENTRA_ACTION_TYPES` e implementar o case |
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` — enfileirar `update_entra` junto com `update` em edições |
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` — enfileirar `update_entra` em ativação/desativação |
| Editar | `src/pages/terceiros/TerceirosPage.tsx` — enfileirar `update_entra` em edições e ativação/desativação |
| Editar | `src/pages/terceiros/TerceiroDetalhePage.tsx` — enfileirar `update_entra` em edições |
| Editar | `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx` — label para `update_entra` |
| Editar | `src/pages/Dashboard.tsx` — label para `update_entra` |

