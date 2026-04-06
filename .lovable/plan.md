
## Plano: corrigir e simplificar todo o fluxo Perfil -> Cargo -> Colaborador -> fila -> Entra ID

### Diagnóstico validado

Há mais de um ponto quebrando o fluxo hoje. O principal problema não é só “processar a fila”, e sim a combinação de inconsistências na geração das ações.

#### 1. `provisionCargoAcessos.ts` ainda está inconsistente e hoje é um ponto de risco
O arquivo continua com problemas estruturais:
- ele ainda gera fila manualmente em vez de reutilizar o helper central;
- depende de selects aninhados como `entra_grupos(...)`, `entra_licencas(...)` e `aplicacoes(...)`, em um projeto onde várias relações não têm FK confiável;
- é justamente o arquivo que já apresentou erro de TypeScript antes.

Isso o torna frágil e propenso a “salvar cargo mas não gerar nada”.

#### 2. Existem dois motores diferentes de geração da `iam_queue`
Hoje o sistema mistura:
- um fluxo novo e melhor em `src/lib/entraQueueHelper.ts`
- vários fluxos antigos que inserem em `iam_queue` manualmente

Isso aparece em:
- `src/lib/provisionCargoAcessos.ts`
- `src/pages/colaboradores/ColaboradorDetalhePage.tsx`
- outros pontos que ainda fazem `supabase.from("iam_queue").insert(...)`

Resultado:
- payloads diferentes
- regra de identidade diferente
- diffs inconsistentes
- mais chance de esquecer grupos/licenças/apps em algum caminho

#### 3. O fluxo de edição de perfil está parcialmente certo, mas ainda depende de um estado materializado paralelo
`PerfilAcessoDetalhePage.tsx` já usa `findAffectedCollaborators()` e `generateEntraQueueForDiff()`, o que é melhor.

Mas o fluxo geral ainda depende de `perfil_atribuicoes` materializada por cargo em vários momentos. Se essa materialização falhar, duplicar ou ficar desatualizada, o sistema entra em estado inconsistente.

#### 4. O caminho “cargo mudou no colaborador” usa uma lógica antiga diferente do caminho “perfil mudou”
Hoje:
- editar perfil usa `generateEntraQueueForDiff`
- editar cargo usa `reprovisionCargoCollaborators`
- alterar colaborador/cargo usa `provisionCargoAcessos`

Ou seja: três caminhos com responsabilidades parecidas, mas implementações diferentes.

#### 5. Há um indício forte de falha de resolução de relação na lógica antiga
Em `provisionCargoAcessos.ts`, os selects usam:
```ts
.select("grupo_id, entra_grupos(entra_id, nome, on_premises_sync)")
.select("licenca_id, entra_licencas(sku_id, nome)")
.select("aplicacao_id, aplicacoes(entra_id, nome, default_app_role_id)")
```

Como o projeto já sofre com ausência de FK em outras tabelas, esse padrão é um candidato forte a retornar objetos nulos silenciosamente e gerar zero ações, mesmo havendo itens no perfil.

#### 6. O processamento da Edge Function está funcionando, mas está recebendo pouco ou nada
Os logs mostram:
```text
Processing batch of 2 Entra ID queue items
Found user by email
Done: 0 success, 2 retries
```

Ou seja:
- o backend está tentando processar
- o usuário está sendo encontrado por e-mail
- o gargalo atual está antes: geração incompleta, inconsistente ou inexistente da fila

### Estratégia de correção

## Objetivo final
Toda alteração que impactar acesso efetivo do usuário deve:
1. descobrir os colaboradores afetados
2. calcular o delta real
3. gerar `assign_*` e `remove_*`
4. disparar processamento imediato

Isso deve valer para:
- editar perfil de acesso
- editar cargo
- trocar cargo do colaborador
- atribuir/revogar perfil manualmente
- reativar usuário

## O que será ajustado

### 1. Transformar `entraQueueHelper.ts` no único motor oficial
**Arquivo:** `src/lib/entraQueueHelper.ts`

Vou consolidar nele:
- descoberta de colaboradores afetados
- leitura de composição de perfil
- geração de diff
- enfileiramento de grupos/licenças/apps
- disparo imediato

Além do que já existe, ele deve ganhar funções utilitárias como:
- `getPerfilResourceIds(perfilId)`
- `queuePerfilAssignments(colabs, perfilIds, mode)`
- `queueSinglePerfilDiffForAffectedUsers(perfilId, oldState, newState)`

Assim todo o sistema usa uma única regra.

### 2. Reescrever `provisionCargoAcessos.ts` para parar de inserir fila manualmente
**Arquivo:** `src/lib/provisionCargoAcessos.ts`

Esse arquivo deve virar apenas um orquestrador de alto nível:
- revoga atribuições de cargo antigas
- materializa novas atribuições
- busca os perfis do cargo
- chama o helper central para gerar assign/remove

Sem:
- joins aninhados frágeis
- inserts manuais na `iam_queue`
- lógica duplicada por tipo de recurso

Isso também elimina os erros de TypeScript e simplifica manutenção.

### 3. Fazer `CargosPage.tsx` usar somente o fluxo central
**Arquivo:** `src/pages/configuracoes/CargosPage.tsx`

Ao salvar alterações no cargo:
- calcular `toAdd` e `toRemove`
- persistir `cargo_perfis`
- chamar uma função central para reprovisionar os colaboradores daquele cargo
- invalidar queries e fechar o dialog

A lógica principal continuará, mas ficará dependente apenas do helper central e não de múltiplos caminhos paralelos.

### 4. Endurecer `PerfilAcessoDetalhePage.tsx`
**Arquivo:** `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx`

A página já está próxima do correto, mas vou ajustar para:
- capturar o estado antigo antes de qualquer delete/insert
- persistir novo estado
- calcular delta de forma explícita e confiável
- usar somente o helper central
- disparar processamento imediato só se houve ações geradas

Também vale remover imports não usados, como `provisionCargoAcessos`, se realmente não for utilizado ali.

### 5. Corrigir `ColaboradorDetalhePage.tsx`
**Arquivo:** `src/pages/colaboradores/ColaboradorDetalhePage.tsx`

Hoje ele ainda faz inserts manuais na `iam_queue` e ainda amarra parte do fluxo ao `sam`.

Vou trocar por helper central para:
- atribuição manual de perfil
- revogação manual de perfil

Assim o colaborador também segue a regra correta:
- e-mail como identidade principal
- mesmo payload
- mesmo tratamento de grupos on-premises
- mesmo trigger imediato

### 6. Revisar `ColaboradoresPage.tsx`
**Arquivo:** `src/pages/colaboradores/ColaboradoresPage.tsx`

Quando o cargo do colaborador muda:
- `provisionCargoAcessos()` precisa refletir exatamente o diff do cargo anterior vs novo cargo
- se o usuário for reativado, reexecutar o provisionamento corretamente
- o texto de toast precisa deixar de sugerir que só `sam` importa, porque para Entra o principal agora é e-mail

### 7. Padronizar regra de identidade
**Arquivos afetados:** helper central + páginas que ainda montam payload

Regra única:
- Entra ID: `email` primeiro, `sam_account_name` como fallback
- payload sempre com `displayName` vindo do nome atual do colaborador
- `target_identity` consistente com a identidade usada para resolução
- sem depender de nome para localizar usuário

### 8. Simplificar a arquitetura
Em vez de múltiplos caminhos, o sistema ficará assim:

```text
Mudança em perfil
-> descobrir afetados (direto + cargo)
-> calcular diff
-> gerar assign/remove
-> processar imediatamente

Mudança em cargo
-> descobrir colaboradores do cargo
-> materializar/revogar perfil_atribuicoes origem=cargo
-> expandir perfis afetados
-> gerar assign/remove
-> processar imediatamente

Mudança de cargo no colaborador
-> revogar perfis do cargo antigo
-> materializar perfis do cargo novo
-> gerar assign/remove
-> processar imediatamente
```

### Arquivos principais

| Ação | Arquivo |
|---|---|
| Consolidar motor central | `src/lib/entraQueueHelper.ts` |
| Reescrever orquestração de cargo por colaborador | `src/lib/provisionCargoAcessos.ts` |
| Ajustar edição de cargos | `src/pages/configuracoes/CargosPage.tsx` |
| Ajustar edição de perfil | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` |
| Remover inserts manuais no detalhe do colaborador | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` |
| Alinhar troca de cargo/reativação | `src/pages/colaboradores/ColaboradoresPage.tsx` |

### Ordem de implementação

1. Fortalecer `entraQueueHelper.ts` como fonte única
2. Reescrever `provisionCargoAcessos.ts` para usar apenas o helper
3. Ajustar `CargosPage.tsx`
4. Ajustar `PerfilAcessoDetalhePage.tsx`
5. Ajustar `ColaboradorDetalhePage.tsx`
6. Revisar `ColaboradoresPage.tsx`
7. Validar todos os caminhos de mudança com processamento imediato

### Resultado esperado

Depois dessa correção:
- adicionar ou remover grupo/licença/app em um perfil refletirá em todos os usuários impactados pelo cargo
- adicionar ou remover um perfil de um cargo refletirá nos usuários daquele cargo
- trocar o cargo do colaborador aplicará exatamente o delta correto
- o sistema ficará mais simples, com um único motor de geração de fila
- o Entra ID será acionado imediatamente após cada mudança relevante
