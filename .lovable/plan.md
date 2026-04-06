

## Plano: Corrigir nome errado nas entradas da fila de provisionamento

### Causa raiz

As 4 entradas mais recentes na `iam_queue` para o seu usuário (criadas em 06/04 às 16:47 via script SQL de correção) contêm o `displayName` errado: **"Mathews Cruz da Silva"** em vez de **"Mathews Henrique Cruz"**.

O nome está correto na tabela `colaboradores`. O código em `provisionCargoAcessos.ts` também busca o nome corretamente do banco. O erro foi exclusivamente no script SQL que gerou as entradas faltantes.

A imagem mostra o `displayName` extraído do `payload_json` dessas entradas, que é exibido no popover de atividades do componente `ColaboradorActivityPopover`.

### Correções

#### 1. Corrigir os 4 registros errados na `iam_queue` (SQL)
Atualizar o `displayName` dentro do `payload_json` e o `mail` das 4 entradas:
- De: `Mathews Cruz da Silva` / `mathews.cruz@ebessolar.com.br`
- Para: `Mathews Henrique Cruz` / `mathews.cruz@origoenergia.com.br`

#### 2. Garantir robustez futura no popover
Alterar `ColaboradorActivityPopover` para exibir o nome do colaborador (prop `colaboradorNome`) no cabeçalho, e manter o `displayName` do payload apenas como detalhe técnico secundário (se diferir). Assim, mesmo que o payload tenha um nome desatualizado, a exibição principal será sempre a do banco de dados.

### Arquivos envolvidos

| Ação | Arquivo |
|---|---|
| Script SQL | Corrigir `payload_json` das 4 entradas com nome errado |
| Revisar | `src/components/ColaboradorActivityPopover.tsx` — usar nome do banco como referência principal |

