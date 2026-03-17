

## Plano de implementacao — 8 itens

Este e um plano extenso com muitas mudancas. Vou dividir em fases para manter a clareza.

---

### 1. Retirar importacao via Entra ID

**Arquivos afetados:**
- `src/pages/configuracoes/IntegracoesPage.tsx` — remover o card "Microsoft Entra ID" e o handler `handleEntraSync`
- `src/hooks/useOrigoData.ts` — remover `useSyncJobs` (entra_id)
- `supabase/functions/sync-entra-id/index.ts` — deletar a edge function
- `supabase/config.toml` — remover a entrada `[functions.sync-entra-id]`

Nota: A importacao de **aplicacoes** do Entra ID sera reimplementada no item 4 como botao dentro do modulo de Aplicacoes.

---

### 2. Conteudo full-width nas telas

**Arquivo afetado:** `src/components/AppLayout.tsx`

Remover `max-w-7xl` do `<main>` para que o conteudo ocupe toda a largura disponivel.

---

### 3. Dialogs funcionais de CRUD em todos os modulos

Hoje, varios modulos tem botoes "Novo X" que nao fazem nada, ou Sheets sem logica de save. Os seguintes modulos precisam de dialogs de adicao, edicao e exclusao com `queryClient.invalidateQueries()`:

| Modulo | Arquivo | Operacoes |
|---|---|---|
| Cargos | `CargosPage.tsx` | add/edit/delete |
| Areas | `AreasPage.tsx` | add/edit/delete |
| Empresas | `EmpresasPage.tsx` | add/edit/delete |
| Localidades | `LocalidadesPage.tsx` | add/edit/delete |
| Operadores | `OperadoresPage.tsx` | add/edit/delete |
| Aplicacoes | `AplicacoesPage.tsx` | add/edit/delete |
| Licencas | `LicencasPage.tsx` | add/edit/delete |
| Terceiros | `TerceirosPage.tsx` | tornar Sheet funcional (save real) + edit/delete |
| Excecoes | `ExcecoesPage.tsx` | tornar Sheet funcional + aprovar/rejeitar |

Cada modulo usara `Dialog` para add/edit e `AlertDialog` para delete, com `supabase.from(table).insert/update/delete` + toast de feedback + invalidacao do cache React Query.

---

### 4. Botao Microsoft no modulo de Aplicacoes

**Arquivos afetados:**
- `src/pages/aplicacoes/AplicacoesPage.tsx` — adicionar icone Microsoft (SVG inline) com botao que chama a edge function `sync-entra-id` para importar **apenas aplicacoes** (nao usuarios)
- `supabase/functions/sync-entra-id/index.ts` — manter mas modificar para importar **apenas aplicacoes** (remover a logica de sync de usuarios)

O botao tera o icone da Microsoft, tamanho pequeno (`size="sm"`), e mostrara progresso via polling do `sync_jobs`.

---

### 5. Alterar cron para 9h UTC-3 (12:00 UTC)

**Acao:** Executar SQL para atualizar o cron job existente:
```sql
SELECT cron.unschedule('sync-csv-diario');
SELECT cron.schedule('sync-csv-diario', '0 12 * * *', ...);
```

Tambem atualizar o texto na `IntegracoesPage.tsx` de "06:00 UTC (03:00 BRT)" para "12:00 UTC (09:00 BRT)".

---

### 6. Telas dinamicas (auto-refresh)

**Arquivo afetado:** `src/hooks/useOrigoData.ts`

Adicionar `refetchInterval: 30000` (30s) a todos os hooks principais para que os dados atualizem automaticamente. Alternativa mais elegante: usar `refetchOnWindowFocus: true` (ja e default do React Query, mas pode estar desabilitado).

Alem disso, apos cada mutacao CRUD nos dialogs (item 3), chamar `queryClient.invalidateQueries()` para refresh imediato.

---

### 7. Corrigir divergencia de usuarios e cargos

**Problema diagnosticado:** A tabela `cargos` NAO tem unique constraint na coluna `nome`. O codigo usa `upsert({ onConflict: "nome" })` que falha silenciosamente. Resultado: 3298 de 3833 colaboradores tem `cargo_id = NULL`.

**Correcao em 3 passos:**

1. **Migracao DB:** Adicionar unique constraint em `cargos.nome`:
```sql
-- Remove duplicatas primeiro
DELETE FROM cargos a USING cargos b 
WHERE a.id > b.id AND LOWER(a.nome) = LOWER(b.nome);
ALTER TABLE cargos ADD CONSTRAINT cargos_nome_unique UNIQUE (nome);
```

2. **Edge functions:** Apos a constraint, o `upsert` funcionara corretamente e os cargos serao criados/encontrados. As funcoes `sync-csv-colab` e `sync-sharepoint-csv` ja usam `row.description || row.title` (correcao anterior).

3. **Re-executar sync:** Apos deploy, executar a sincronizacao novamente para popular os cargo_ids faltantes. Como o hash mudara (porque description agora esta no hash), todos os registros serao atualizados.

**Total de colaboradores faltantes (41 de 3874):** Provavelmente linhas com `employID` vazio ou duplicado. Verificar e logar no proximo sync.

---

### 8. Sistema de gerenciamento de usuarios

Criar autenticacao completa com:

**Migracao DB:** Tabela `profiles`:
```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```
Com trigger para auto-criar profile no signup e RLS policies.

**Paginas novas:**
- `/login` — formulario de login (email+senha)
- `/signup` — cadastro (com confirmacao de email)
- `/reset-password` — redefinicao de senha
- `/admin/usuarios` — listagem de usuarios com CRUD (apenas admin)

**Componentes:**
- `AuthProvider` — contexto de autenticacao com `onAuthStateChange`
- `ProtectedRoute` — wrapper que redireciona para `/login` se nao autenticado
- Atualizar `App.tsx` — rotas protegidas + rotas publicas (login, signup, reset)
- Atualizar `AppSidebar.tsx` e `AppLayout.tsx` — mostrar usuario logado + botao logout

**Fluxo:**
- Admin pode criar/editar/excluir usuarios e definir perfil (admin/operador/user)
- Usuario pode trocar propria senha
- Sem auto-confirm de email (verificacao obrigatoria)

---

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Deletar | `supabase/functions/sync-entra-id/index.ts` (reimplementar so apps) |
| Editar | `src/components/AppLayout.tsx` (full-width) |
| Editar | `src/pages/configuracoes/IntegracoesPage.tsx` (remover Entra card, horario) |
| Editar | `src/pages/aplicacoes/AplicacoesPage.tsx` (botao Microsoft + CRUD) |
| Editar | `src/pages/configuracoes/CargosPage.tsx` (CRUD dialogs) |
| Editar | `src/pages/configuracoes/AreasPage.tsx` (CRUD dialogs) |
| Editar | `src/pages/configuracoes/EmpresasPage.tsx` (CRUD dialogs) |
| Editar | `src/pages/configuracoes/LocalidadesPage.tsx` (CRUD dialogs) |
| Editar | `src/pages/configuracoes/OperadoresPage.tsx` (CRUD dialogs) |
| Editar | `src/pages/licencas/LicencasPage.tsx` (CRUD dialogs) |
| Editar | `src/pages/terceiros/TerceirosPage.tsx` (CRUD funcional) |
| Editar | `src/pages/excecoes/ExcecoesPage.tsx` (CRUD funcional) |
| Editar | `src/hooks/useOrigoData.ts` (refetch auto) |
| Editar | `supabase/functions/sync-entra-id/index.ts` (so apps) |
| Editar | `src/App.tsx` (rotas auth + admin) |
| Editar | `src/components/AppSidebar.tsx` (usuario logado) |
| Criar | `src/pages/auth/LoginPage.tsx` |
| Criar | `src/pages/auth/ResetPasswordPage.tsx` |
| Criar | `src/pages/admin/UsuariosPage.tsx` |
| Criar | `src/contexts/AuthContext.tsx` |
| Criar | `src/components/ProtectedRoute.tsx` |
| Migracao | Unique constraint em `cargos.nome` |
| Migracao | Tabela `profiles` + trigger |
| SQL | Re-agendar cron para `0 12 * * *` |

