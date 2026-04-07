

## Plano: Exceções como bypass de desativação (férias, afastamento, etc.)

### Situação atual

O módulo de Exceções trata apenas de **concessão de perfis de acesso extras**. Não existe mecanismo para impedir que o sistema desative um usuário que está em férias/afastamento mas precisa permanecer ativo por algum motivo justificado.

### Solução

Adicionar um **tipo de exceção** ao módulo. Além de "Concessão de Acesso" (comportamento atual), haverá "Manter Ativo" — uma exceção que, enquanto aprovada e dentro da validade, impede o sistema de desativar/revogar acessos do colaborador.

### Alterações

**1. Migração — coluna `tipo_excecao` na tabela `excecoes`:**
```sql
ALTER TABLE excecoes ADD COLUMN tipo_excecao text NOT NULL DEFAULT 'acesso';
```
Valores: `acesso` (concessão de perfil, padrão atual) | `manter_ativo` (bypass de desativação).

**2. `ExcecoesPage.tsx` — formulário e listagem:**
- Adicionar Select de "Tipo de Exceção" no dialog de criação com duas opções: "Concessão de Acesso" e "Manter Ativo"
- Quando tipo = `manter_ativo`, tornar o campo "Perfil" opcional/oculto (não se trata de conceder perfil, mas de manter o usuário ativo)
- Exibir coluna "Tipo" na tabela com Badge diferenciado
- Na aprovação de tipo `manter_ativo`, não provisionar perfil — apenas registrar a exceção aprovada

**3. `ColaboradorDetalhePage.tsx` — checagem antes de desativar:**
- Antes de executar o fluxo de desativação (linha 304-361), consultar `excecoes` para verificar se existe exceção `manter_ativo` aprovada, dentro da validade, para aquele `colaborador_id`
- Se existir, exibir toast de alerta informando que há uma exceção ativa e bloquear a desativação
- Mostrar badge "Exceção Ativa" na ficha do colaborador quando houver exceção vigente

**4. `TerceiroDetalhePage.tsx` — mesma checagem:**
- Aplicar a mesma lógica de verificação de exceção antes de desativar terceiros (se `colaborador_id` for compartilhado ou se precisar adicionar `terceiro_id` à tabela de exceções)

### Fluxo

```text
Admin cria exceção tipo "Manter Ativo" para João (férias mas precisa acessar)
  → Exceção fica pendente
  → Admin/aprovador aprova
  → Exceção fica com status "aprovada" + validade (ex: 30 dias)
  → Alguém tenta mudar status de João para "férias"
  → Sistema consulta excecoes WHERE colaborador_id = João AND tipo_excecao = 'manter_ativo' AND status = 'aprovada' AND validade >= hoje
  → Encontra exceção → bloqueia desativação + exibe toast
  → Após validade expirar → exceção vira "expirada" → desativação volta a funcionar normalmente
```

### Arquivos

| Ação | Arquivo |
|---|---|
| Migração | Adicionar coluna `tipo_excecao` à tabela `excecoes` |
| Editar | `src/pages/excecoes/ExcecoesPage.tsx` — tipo de exceção no form, coluna na tabela, lógica de aprovação condicional |
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` — checagem de exceção ativa antes de desativar |
| Editar | `src/pages/terceiros/TerceiroDetalhePage.tsx` — mesma checagem de exceção |

