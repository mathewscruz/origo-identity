

# Plano: Corrigir duplicacao de perfis e falha na revogacao de recursos

## Problemas identificados (confirmados via dados)

**1. Desativacao NAO revoga `perfil_atribuicoes`**
O fluxo de desativacao no `ColaboradorDetalhePage.tsx` (linhas 432-501) enfileira `remove_*` via `queueFullProfileActions`, mas nunca executa `perfil_atribuicoes.update({ ativo: false })`. Os registros permanecem `ativo: true` no banco.

**2. Desativacao NAO remove recursos individuais nem de perfil**
Nos dados reais, a ultima desativacao (18:38) gerou apenas `disable` + `disable_entra`. Nenhum `remove_group`, `remove_license` ou `remove_app` foi criado. Isso indica que o `queueFullProfileActions` falhou silenciosamente ou nao foi chamado — provavelmente porque a query de `activeAtribuicoes` retornou vazio (os registros ja tinham sido revogados de ciclos anteriores, mas novos foram criados sem revogacao).

**3. Reativacao cria duplicatas**
`provisionCargoAcessos(id, cargo_id, null)` recebe `oldCargoId = null`, entao o bloco de revogacao (linha 80) e ignorado. Novos registros sao inseridos sem desativar os existentes. No banco: 2 registros `ativo: true` para o mesmo perfil e colaborador.

**4. Sem diferenciacao hard/soft disable**
O bloco de desativacao executa revogacao total para QUALQUER status nao-ativo (incluindo ferias/afastado), quando deveria apenas desabilitar login nesses casos.

## Correcoes

### Arquivo 1: `src/pages/colaboradores/ColaboradorDetalhePage.tsx`

**A. Separar hard disable vs soft disable no handler de status**

```text
Status "ativo" → "desligado" ou "inativo" = HARD DISABLE:
  1. Inserir disable + disable_entra
  2. Desativar TODOS os perfil_atribuicoes (ativo = false)  ← NOVO
  3. Enfileirar remove_* para perfis e individuais
  4. Criar evento JML leaver com snapshot

Status "ativo" → "ferias" ou "afastado" = SOFT DISABLE:
  1. Inserir disable + disable_entra (apenas bloqueia login)
  2. NAO revogar perfis nem recursos
  3. Criar evento JML leaver com tipo "soft"
```

**B. No hard disable, adicionar revogacao de `perfil_atribuicoes`**

Antes de chamar `queueFullProfileActions`, executar:
```sql
UPDATE perfil_atribuicoes 
SET ativo = false, data_revogacao = now()
WHERE colaborador_id = :id AND ativo = true
```

Isso garante que os registros sao desativados E que a query de perfis retorna os IDs corretos para o snapshot.

**C. Na reativacao, buscar perfis do snapshot em vez de re-provisionar cegamente**

Inverter a ordem: primeiro verificar se ja existem `perfil_atribuicoes` ativas. Se existirem (soft disable), nao re-provisionar. Se nao existirem (hard disable), usar `provisionCargoAcessos`.

### Arquivo 2: `src/lib/provisionCargoAcessos.ts`

**D. Prevenir duplicatas no insert**

Antes de inserir novos `perfil_atribuicoes` de cargo, desativar qualquer registro ativo existente para os mesmos perfil_ids + colaborador_id + origem="cargo":

```typescript
// Before inserting, deactivate any existing active cargo atribuicoes
await supabase
  .from("perfil_atribuicoes")
  .update({ ativo: false, data_revogacao: new Date().toISOString() })
  .eq("colaborador_id", colaboradorId)
  .eq("origem", "cargo")
  .eq("ativo", true);
```

Isso funciona como uma salvaguarda independente de qual fluxo chamou a funcao.

## Resumo de alteracoes

| Arquivo | Alteracao |
|---|---|
| `ColaboradorDetalhePage.tsx` | Diferenciar hard/soft disable; adicionar revogacao de perfil_atribuicoes no hard disable; prevenir re-provisionamento duplicado na reativacao |
| `provisionCargoAcessos.ts` | Adicionar desativacao preventiva de cargo atribuicoes existentes antes de inserir novas |

## Dados para limpeza (pos-deploy)

O usuario "Teste IAM 7" tem 2 registros `perfil_atribuicoes` ativos duplicados. Uma migration pode limpar isso, ou o proximo ciclo de desativacao/reativacao corrigira automaticamente com a nova logica.

