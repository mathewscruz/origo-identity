

## Plano: Importar acessos do Entra ID e logica "somente adicionar"

### Contexto

Hoje o sistema nao importa os acessos atuais de um colaborador no Entra ID ao cadastra-lo. Alem disso, ao mudar de cargo, o `provisionCargoAcessos` calcula delta e **remove** recursos que existiam no cargo antigo mas nao no novo — o que causaria perda de acessos individuais.

### Regras solicitadas

1. **Ao adicionar colaborador** (manual ou CSV): buscar no Entra ID seus grupos, apps e licencas atuais e registrar como acessos individuais (`requested_by: "entra_sync"`).
2. **Ao atribuir perfil de cargo**: apenas **adicionar** os recursos diferenciais. Nunca remover nada.
3. **Ao desabilitar**: remover tudo (perfis + individuais) — ja funciona assim.

---

### Alteracoes

**1. Criar Edge Function `sync-user-access/index.ts`**

Nova funcao que recebe `{ colaborador_id }`, busca o colaborador no banco (email/sam), resolve o usuario no Entra ID via Graph API, e consulta:
- `GET /users/{id}/memberOf` — grupos
- `GET /users/{id}/licenseDetails` — licencas
- `GET /users/{id}/appRoleAssignments` — apps

Para cada recurso encontrado, faz match com as tabelas locais (`entra_grupos` por `entra_id`, `entra_licencas` por `sku_id`, `aplicacoes` por `entra_id`) e insere na `iam_queue` como `assign_group/assign_license/assign_app` com `requested_by: "entra_sync"` e `status: "success"` (ja existem no Entra, nao precisam ser processados — servem como registro).

**2. Editar `src/pages/colaboradores/ColaboradoresPage.tsx`**

Apos salvar um novo colaborador (manual), chamar a edge function `sync-user-access` passando o `colaborador_id`. Adicionar toast informando que os acessos estao sendo importados.

**3. Editar `supabase/functions/sync-csv-colab/index.ts`**

Ao final do processamento de cada colaborador novo (joiner), chamar internamente a mesma logica de import de acessos do Entra ID para esse colaborador.

**4. Editar `src/lib/provisionCargoAcessos.ts`**

Remover a logica de revogacao de acessos no Entra ID ao mudar de cargo:
- Manter a revogacao de `perfil_atribuicoes` no banco (para rastreabilidade de que o perfil antigo nao e mais vigente)
- No calculo de `diff`, zerar `removedGrupoIds`, `removedLicencaIds`, `removedAppIds` — so enviar os `added*`
- Ou seja: ao mudar de cargo, so se adiciona o diferencial

**5. Editar `src/lib/entraQueueHelper.ts` — `reprovisionCargoCollaborators`**

Mesma logica: ao remover perfis de um cargo, revogar `perfil_atribuicoes` no banco mas **nao** gerar `remove_*` na `iam_queue`. Apenas gerar `assign_*` para perfis adicionados.

**6. Editar `src/hooks/useOrigoData.ts` — `useColabIndividualQueue`**

Incluir `"entra_sync"` na lista de `requested_by` para que acessos importados aparecam na aba "Acessos Individuais" do detalhe do colaborador.

**7. Ajustar `src/pages/colaboradores/ColaboradorDetalhePage.tsx`**

- Na aba de acessos, mostrar badge "Importado do Entra" para itens com `requested_by: "entra_sync"`
- Garantir que a logica de desativacao (leaver) continua removendo tudo — ja funciona

---

### Configuracao

| Acao | Arquivo |
|---|---|
| Criar | `supabase/functions/sync-user-access/index.ts` — importar acessos atuais do Entra ID |
| Editar | `supabase/config.toml` — adicionar config da nova function |
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` — chamar sync apos criar colaborador |
| Editar | `supabase/functions/sync-csv-colab/index.ts` — chamar sync para novos colaboradores |
| Editar | `src/lib/provisionCargoAcessos.ts` — remover logica de remove no Entra ao mudar cargo |
| Editar | `src/lib/entraQueueHelper.ts` — nao gerar remove_* ao remover perfis de cargo |
| Editar | `src/hooks/useOrigoData.ts` — incluir entra_sync no query de individuais |
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` — badge de origem "Importado" |

### Resultado esperado
- Ao cadastrar colaborador, seus acessos atuais do Entra ID sao registrados como individuais
- Ao atribuir perfil via cargo, so se adiciona o diferencial (nunca remove)
- Ao desabilitar, todos os acessos sao removidos normalmente

