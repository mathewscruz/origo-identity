
## Plano: corrigir o encadeamento Perfil -> Cargo -> Colaborador para refletir automaticamente no Entra ID

### Diagnóstico validado

Hoje o fluxo quebra em mais de um ponto:

1. **Mudança em cargo não reprovisiona os colaboradores**
   - Em `src/pages/configuracoes/CargosPage.tsx`, ao alterar `cargo_perfis`, o sistema só grava o vínculo e envia uma ação genérica `update`.
   - Essa ação **não representa** diff de grupos/licenças/apps e **não é o mecanismo correto** para Entra ID.

2. **Edição de perfil depende de `perfil_atribuicoes` já materializada**
   - Em `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx`, o diff do perfil procura usuários afetados só via `perfil_atribuicoes`.
   - Se o vínculo cargo -> perfil não foi propagado corretamente antes, o perfil muda, mas o usuário não entra como “afetado”, então **nenhuma ação é gerada**.

3. **`provisionCargoAcessos` ainda depende de `sam_account_name` para gerar fila**
   - Em `src/lib/provisionCargoAcessos.ts`, a geração de ações Entra ainda fica condicionada ao `sam`.
   - Isso contradiz a regra atual de resolução por **e-mail primeiro**.

### O que será ajustado

#### 1. Corrigir o fluxo de cargo para realmente refletir nos usuários
**Arquivo:** `src/pages/configuracoes/CargosPage.tsx`

Ao salvar mudanças em `cargo_perfis`, o sistema passará a:
- calcular `perfis adicionados` e `perfis removidos`;
- buscar todos os colaboradores com aquele cargo;
- **criar/revogar `perfil_atribuicoes` origem=`cargo`** para esses colaboradores;
- gerar `assign_*` e `remove_*` de grupos, licenças e apps no Entra ID;
- disparar processamento imediato.

Isso fecha o elo **Cargo -> Colaborador**.

#### 2. Corrigir o fluxo de edição de perfil para alcançar todos os usuários impactados
**Arquivo:** `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx`

A página deixará de depender só de `perfil_atribuicoes` e passará a montar a lista de afetados por duas fontes:
- colaboradores com `perfil_atribuicoes` ativa para o perfil;
- colaboradores cujo **cargo** possui esse perfil em `cargo_perfis`.

Depois disso:
- calculará o diff de grupos/licenças/apps;
- gerará `assign_*` para adicionados;
- gerará `remove_*` para removidos;
- disparará o processamento imediato.

Isso fecha o elo **Perfil -> Cargo -> Colaborador**.

#### 3. Ajustar `provisionCargoAcessos` para Entra usar e-mail como fallback real
**Arquivo:** `src/lib/provisionCargoAcessos.ts`

A função passará a:
- não bloquear a geração de fila do Entra quando `sam_account_name` estiver vazio;
- usar `email` como identidade mínima para ações cloud;
- manter `sam` apenas como suporte para cenários legados/AD local.

#### 4. Centralizar a geração de ações de acesso
**Arquivos:** helper novo em `src/lib/` + páginas que hoje inserem fila manualmente

Para evitar novos furos, vou concentrar a montagem de:
- `assign_group` / `remove_group`
- `assign_license` / `remove_license`
- `assign_app` / `remove_app`

em um helper reutilizável, usado por:
- edição de perfil;
- edição de cargo;
- atribuição/revogação manual de perfil;
- provisionamento por cargo.

Assim todas as rotas passam a gerar o mesmo payload e a mesma lógica de diff.

### Resultado esperado

Depois da correção:

- se você **adicionar ou remover grupo/licença/app em um perfil**, todos os colaboradores impactados por esse perfil, inclusive via cargo, receberão as ações corretas;
- se você **adicionar ou remover um perfil de um cargo**, os colaboradores daquele cargo terão seus acessos materializados e sincronizados;
- o Entra ID passará a refletir automaticamente a mudança ligada ao usuário;
- o sistema deixará de depender de um estado intermediário quebrado em `perfil_atribuicoes` para descobrir quem foi impactado.

### Detalhe técnico

```text
Hoje
perfil muda
-> sistema procura só perfil_atribuicoes
-> se cargo/perfil não foi materializado antes, usuário não entra no diff
-> zero ações para o Entra ID

Depois
perfil muda
-> sistema busca afetados por perfil_atribuicoes + cargo_perfis -> colaboradores
-> gera assign/remove do delta
-> processa imediatamente
```

```text
Hoje
cargo_perfis muda
-> só grava vínculo e manda "update"
-> usuário não recebe novo perfil nem perde o removido

Depois
cargo_perfis muda
-> cria/revoga perfil_atribuicoes origem=cargo
-> gera assign/remove de grupos/licenças/apps
-> Entra ID reflete automaticamente
```

### Arquivos principais

| Ação | Arquivo |
|---|---|
| Corrigir propagação cargo -> colaboradores | `src/pages/configuracoes/CargosPage.tsx` |
| Corrigir descoberta de afetados ao editar perfil | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` |
| Remover dependência indevida de `sam` no Entra | `src/lib/provisionCargoAcessos.ts` |
| Centralizar geração de ações Entra | novo helper em `src/lib/` |
| Reaproveitar helper em fluxos manuais | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` e pontos similares |

### Ordem de implementação

1. Criar helper central de geração de fila Entra
2. Corrigir `CargosPage` para materializar e reprovisionar colaboradores
3. Corrigir `PerfilAcessoDetalhePage` para descobrir afetados por cargo também
4. Ajustar `provisionCargoAcessos` para e-mail-first de verdade
5. Revisar os demais pontos que ainda inserem `iam_queue` manualmente para usar o mesmo padrão
