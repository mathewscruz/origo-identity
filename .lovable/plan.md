

## Plano: Migrar para arquitetura de fila de provisionamento (iam_queue)

### Resumo

Remover toda execucao direta no Entra ID. O sistema passa a ser uma camada de solicitacao e auditoria. Todas as acoes de lifecycle (criar, editar, desabilitar, excluir usuario) geram registros na tabela `iam_queue` com status `pending`. Um agent externo (fora do Lovable) consumira essa fila.

### 1. Banco de dados — nova tabela `iam_queue`

```sql
CREATE TABLE iam_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL, -- create, update, disable, delete
  status text NOT NULL DEFAULT 'pending', -- pending, processing, success, failed
  payload_json jsonb NOT NULL,
  requested_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  result_message text,
  correlation_id text NOT NULL DEFAULT gen_random_uuid()::text,
  colaborador_id uuid
);

ALTER TABLE iam_queue ENABLE ROW LEVEL SECURITY;
-- Politicas RLS padrao (select all authenticated, insert/update/delete admin/operador)
-- Habilitar realtime para atualizacao de status
ALTER PUBLICATION supabase_realtime ADD TABLE iam_queue;
```

### 2. Remover logica de execucao direta no Entra ID

**Edge functions a remover/desativar:**
- `provision-entra-user` — remover chamadas do frontend (nao deletar arquivo, apenas parar de chamar)
- `disable-entra-user` — remover chamadas do frontend
- `reprovision-entra-users` — remover chamadas do frontend

**Arquivos frontend afetados:**

| Arquivo | O que muda |
|---|---|
| `ColaboradoresPage.tsx` | Remover `callEdgeFunction`, `disableEntraUser`, `provisionEntraUser`. Substituir por inserts na `iam_queue`. Remover dialog de senha provisoria. Mensagens passam a ser "Solicitacao enviada para processamento". |
| `ColaboradorDetalhePage.tsx` | Remover `disableEntraUser`. Status change gera insert na `iam_queue` (disable/enable). |
| `PerfilAcessoDetalhePage.tsx` | Remover chamada a `reprovision-entra-users`. Ao salvar perfil, gerar registros `update` na `iam_queue` para cada colaborador afetado. |
| `CargosPage.tsx` | Remover chamada a `reprovision-entra-users`. Gerar registros na `iam_queue`. |

### 3. Logica de insercao na fila por tipo de acao

**Criar colaborador manual:**
```typescript
await supabase.from("iam_queue").insert({
  action_type: "create",
  payload_json: {
    givenName, surname, displayName, samAccountName,
    userPrincipalName, mail, department, title,
    manager, company, telephoneNumber, ouPath
  },
  requested_by: profile?.email,
  colaborador_id: novoId,
});
toast({ title: "Solicitação enviada para processamento" });
```

**Editar colaborador:**
- `action_type: "update"`, payload com `samAccountName` + campos alterados

**Desabilitar (status != ativo):**
- `action_type: "disable"`, payload com `samAccountName`, motivo, data

**Excluir:**
- `action_type: "delete"`, payload com `samAccountName`, motivo, data

**Editar perfil/cargo (reprovisionar):**
- Para cada colaborador afetado, gerar `action_type: "update"` com os novos acessos consolidados

### 4. Nova pagina: Fila de Provisionamento

**Rota:** `/fila-provisionamento`

**Sidebar:** Adicionar em "Operacao" com icone `ListOrdered`

**Funcionalidades:**
- Tabela com colunas: correlation_id, acao, usuario (do payload), status, solicitante, data solicitacao, data processamento, resultado
- Filtros: status (pending/processing/success/failed), action_type (create/update/disable/delete), busca por nome
- Paginacao

### 5. Nova pagina: Detalhe da solicitacao

**Rota:** `/fila-provisionamento/:id`

Ao clicar numa solicitacao, mostra:
- Acao (action_type)
- Solicitante (requested_by)
- payload_json formatado (JSON prettified em card)
- Status atual com badge colorido
- Resultado (result_message)
- Datas (created_at, processed_at)
- correlation_id

### 6. Atualizar ColaboradorActivityPopover

Adicionar consulta a `iam_queue` por `colaborador_id` para mostrar status das solicitacoes pendentes/processadas no popover de atividade.

### 7. Ajustar mensagens de interface

- Criar: "Solicitacao de criacao enviada para processamento"
- Editar: "Solicitacao de atualizacao enviada"
- Desabilitar: "Solicitacao de desativacao enviada"
- Excluir: "Solicitacao de exclusao enviada"
- Nunca exibir "usuario criado" como se ja tivesse sido processado

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Migration | Nova tabela `iam_queue` + RLS |
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` |
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` |
| Editar | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` |
| Editar | `src/pages/configuracoes/CargosPage.tsx` |
| Editar | `src/components/ColaboradorActivityPopover.tsx` |
| Editar | `src/components/AppSidebar.tsx` |
| Editar | `src/App.tsx` |
| Criar | `src/pages/fila-provisionamento/FilaProvisionamentoPage.tsx` |
| Criar | `src/pages/fila-provisionamento/SolicitacaoDetalhePage.tsx` |

