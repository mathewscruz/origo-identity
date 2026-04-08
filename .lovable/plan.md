

## Plano: Framework de Conectores para Aplicações Externas (SAP, GLPI, etc.)

### Conceito

Criar uma infraestrutura genérica que permita:
1. Cadastrar conectores por aplicação (URL base, tipo de API, credenciais)
2. Cada app externa publica seus **perfis internos** (roles/profiles disponíveis nela)
3. Na composição do Perfil de Acesso, além de apps/grupos/licenças, o operador escolhe qual **perfil interno** da app o usuário receberá
4. A `iam_queue` ganha novos action_types genéricos que o processador traduz em chamadas REST específicas por conector

### Regras de negócio

- O sistema **nunca importa usuários** das apps externas — apenas cria, edita e desativa
- Cada app publica seus perfis/roles disponíveis para o sistema consumir (via API ou cadastro manual)
- O fluxo de provisionamento é unidirecional: nosso sistema → app externa

### Modelo de dados

```text
┌─────────────────────┐
│   aplicacoes        │  (já existe)
│ + connector_type    │  'entra' | 'rest_api' | 'scim' | 'manual'
│ + connector_config  │  jsonb: { base_url, auth_type, ... }
└────────┬────────────┘
         │ 1:N
┌────────┴────────────┐
│ aplicacao_perfis_int│  (NOVA)
│  id, aplicacao_id   │
│  nome_externo       │  ex: "Technician", "Admin", "ReadOnly"
│  external_id        │  id do perfil no sistema externo
│  descricao          │
└─────────────────────┘

┌─────────────────────┐
│ perfil_apps_internos│  (NOVA — vínculo perfil_acesso ↔ app + perfil interno)
│  id, perfil_id      │
│  aplicacao_id       │
│  perfil_interno_id  │  → aplicacao_perfis_internos.id
└─────────────────────┘
```

### Alterações

**1. Migração — Novas tabelas e colunas:**
- Adicionar `connector_type` (text, default `'manual'`) e `connector_config` (jsonb, nullable) à tabela `aplicacoes`
- Criar tabela `aplicacao_perfis_internos` (id, aplicacao_id, nome_externo, external_id, descricao, ativo, created_at)
- Criar tabela `perfil_apps_internos` (id, perfil_id, aplicacao_id, perfil_interno_id, created_at) — vincula um perfil de acesso a um perfil interno de uma app
- RLS: mesmos padrões existentes (admin/operador insert/update/delete, authenticated/anon select)

**2. Edge Function `sync-app-profiles` (NOVA):**
- Recebe `aplicacao_id`, lê `connector_config` da aplicação
- Faz chamada à API da app externa para listar perfis/roles disponíveis
- Upsert em `aplicacao_perfis_internos`
- Suporta tipos: REST genérico (GET endpoint configurável), SCIM
- Para apps sem API, o cadastro é manual via UI

**3. Edge Function `process-iam-queue` — Novos action types:**
- `create_user_app` — criar usuário na app externa com perfil interno
- `update_user_app` — alterar perfil interno do usuário na app
- `disable_user_app` — desativar usuário na app externa
- `delete_user_app` — remover usuário da app externa
- Dispatcher genérico: lê `connector_config` da aplicação e monta a chamada REST/SCIM adequada

**4. UI — Página de detalhe da Aplicação (`AplicacaoDetalhePage.tsx`):**
- Nova aba "Conector" para configurar `connector_type`, `base_url`, `auth_type`, headers
- Nova aba "Perfis Internos" listando os perfis da app com botão "Sincronizar" e opção de cadastro manual
- Botão "Testar Conexão" para validar credenciais

**5. UI — Perfil de Acesso (`PerfilAcessoDetalhePage.tsx`):**
- Na aba "Aplicativos", ao vincular uma app que possui perfis internos, exibir um dropdown para selecionar qual perfil interno será atribuído
- Gravar em `perfil_apps_internos`

**6. UI — Integrações (`IntegracoesPage.tsx`):**
- Novo card "Conectores de Aplicações" mostrando quantas apps têm conector ativo e status geral

**7. Secrets — Credenciais por app:**
- As credenciais de cada conector ficam no `connector_config` (jsonb) da aplicação
- Para segurança, campos sensíveis (tokens/passwords) são armazenados como secrets no backend referenciados por chave no config

### Arquivos

| Ação | Arquivo |
|---|---|
| Migração | `connector_type` + `connector_config` em `aplicacoes`; tabelas `aplicacao_perfis_internos` e `perfil_apps_internos` |
| Criar | `supabase/functions/sync-app-profiles/index.ts` — sincronizar perfis internos de apps externas |
| Editar | `supabase/functions/process-iam-queue/index.ts` — novos action types genéricos |
| Editar | `src/pages/aplicacoes/AplicacaoDetalhePage.tsx` — abas Conector e Perfis Internos |
| Editar | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` — seleção de perfil interno por app |
| Editar | `src/pages/configuracoes/IntegracoesPage.tsx` — card resumo de conectores |

