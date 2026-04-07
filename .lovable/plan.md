

## Plano: Portal Externo de Solicitações (separado, com autenticação própria)

### Conceito

Criar uma rota pública `/portal` com layout próprio (sem sidebar do admin) que exige autenticação. Usuários do portal usam as mesmas credenciais do sistema (tabela `auth.users`), mas ao logar são direcionados para uma interface simplificada onde podem:

1. **Criar novas solicitações** de acesso (escolhendo perfil e justificativa)
2. **Ver seus próprios chamados** e o status de cada um (pendente, aprovada, rejeitada)

Os chamados criados no portal caem automaticamente na página de Solicitações do admin (`/solicitacoes`), onde os operadores aprovam/rejeitam normalmente.

### Arquitetura

```text
/portal (público, layout próprio)
├── /portal/login    → tela de login do portal (mesma auth)
├── /portal          → dashboard do usuário (meus chamados + novo)
```

```text
Usuário Portal                     Admin/Operador
    │                                    │
    ├─ Loga no /portal/login             │
    ├─ Cria solicitação ──────────────► Aparece em /solicitacoes
    ├─ Vê status dos seus chamados  ◄── Aprova/Rejeita
    │                                    │
```

### Detalhes de implementação

**1. Migração: adicionar `user_id` na tabela `solicitacoes_acesso`**

Adicionar coluna `user_id` (uuid, nullable, referenciando `auth.users`) para vincular solicitações ao usuário logado no portal. Adicionar RLS policy para que usuários autenticados possam inserir (com `user_id = auth.uid()`) e selecionar apenas seus próprios registros.

**2. Nova página: `PortalLayout.tsx`**

Layout limpo com header simples (logo Órigo + botão sair), sem sidebar. Verifica se o usuário está logado, senão redireciona para `/portal/login`.

**3. Nova página: `PortalLoginPage.tsx`**

Tela de login simplificada para o portal externo. Usa a mesma autenticação do sistema. Após login, redireciona para `/portal`.

**4. Nova página: `PortalSolicitacoesPage.tsx`**

- Lista de "Meus Chamados" filtrada por `user_id = auth.uid()`
- Botão "Nova Solicitação" com formulário (perfil desejado + justificativa)
- O `solicitante_id` será preenchido buscando o colaborador vinculado ao e-mail do usuário logado
- Cards de status: Total, Pendentes, Aprovadas, Rejeitadas
- Cada chamado mostra: perfil solicitado, data, status, comentário do aprovador

**5. Atualizar `App.tsx`**

Adicionar rotas `/portal`, `/portal/login` fora do `ProtectedRoute` (com proteção própria no layout).

**6. Atualizar botão "Portal Externo" em `SolicitacoesPage.tsx`**

Apontar para `/portal` ao invés do link externo atual.

### Arquivos

| Acao | Arquivo |
|---|---|
| Migração | Adicionar `user_id` à tabela `solicitacoes_acesso` + RLS para users verem/inserirem seus próprios registros |
| Criar | `src/pages/portal/PortalLayout.tsx` — layout do portal (header + proteção de rota) |
| Criar | `src/pages/portal/PortalLoginPage.tsx` — login do portal |
| Criar | `src/pages/portal/PortalSolicitacoesPage.tsx` — meus chamados + nova solicitação |
| Editar | `src/App.tsx` — rotas `/portal` e `/portal/login` |
| Editar | `src/pages/solicitacoes/SolicitacoesPage.tsx` — atualizar link do botão "Portal Externo" |

