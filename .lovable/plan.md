

## Plano: Auto-preenchimento de login/e-mail para terceiros + Revalidação a cada 45 dias

### 1. Auto-preenchimento de Nome de Login AD e E-mail (bloqueados)

**`TerceirosPage.tsx` — formulário de criação/edição:**

Adicionar função `generateTerceiroCredentials(nome, empresaTerceira)` que:
- Normaliza o nome (remove acentos, minúsculas, ignora preposições: de, da, do, dos, das)
- Gera `sam_account_name`: `nome.sobrenome_primeironomeempresa`
- Gera `email`: `nome.sobrenome_primeironomeempresa@parceiroorigo.com.br`
- Para empresas compostas, usa apenas o primeiro nome (ex: "Tech Solutions" → "tech")

A função é chamada automaticamente via `useEffect` quando `form.nome` ou `form.empresa_terceira` mudam. Os campos de login AD e e-mail ficam **readonly/disabled** com fundo acinzentado para indicar que são automáticos.

Exemplo:
```text
Nome: "João Carlos da Silva"
Empresa: "Tech Solutions Ltda"
→ sam_account_name: joao.silva_tech
→ email: joao.silva_tech@parceiroorigo.com.br
```

Na edição, os campos continuam bloqueados (não permite alteração manual).

### 2. Aviso de revalidação a cada 45 dias

**`TerceirosPage.tsx` — formulário:**
- Adicionar um banner informativo (Alert) abaixo do campo "Fim contrato" no dialog:
  > "Este terceiro será revalidado automaticamente a cada 45 dias. O responsável receberá um e-mail com as opções de manter ou revogar o acesso."

**`TerceiroDetalhePage.tsx` — ficha:**
- Adicionar card/banner na aba "Contrato" informando o ciclo de revalidação de 45 dias e a próxima data de revalidação (calculada com base na data de início do contrato)

### 3. Edge Function de revalidação automática (`auto-recertification`)

**Editar `auto-recertification/index.ts` — PART 3: Revalidação de Terceiros:**
- Buscar todos os terceiros ativos com `contrato_fim` no futuro
- Para cada terceiro, calcular se já se passaram 45 dias desde a última revalidação (verificar na tabela `revisoes` ou criar um campo/parametro)
- Se 45 dias se passaram sem revalidação:
  - Enviar e-mail ao `responsavel` com link para página de revalidação externa (similar ao fluxo de revisão externa existente)
  - O link contém opções: **Manter** (estende por +45 dias) ou **Revogar** (desativa o terceiro)
- Se o responsável clicar em "Revogar", o sistema desativa o terceiro automaticamente (disable AD + Entra + revogar perfis)
- Se clicar em "Manter", registra a revalidação e agenda a próxima em 45 dias
- O ciclo se repete até o fim do contrato

### Migração

Adicionar coluna `ultima_revalidacao` (date, nullable) à tabela `terceiros` para rastrear quando foi a última revalidação.

### Arquivos

| Ação | Arquivo |
|---|---|
| Migração | Adicionar `ultima_revalidacao` à tabela `terceiros` |
| Editar | `src/pages/terceiros/TerceirosPage.tsx` — auto-preenchimento de login/e-mail (readonly) + aviso revalidação |
| Editar | `src/pages/terceiros/TerceiroDetalhePage.tsx` — banner de revalidação na aba contrato |
| Editar | `supabase/functions/auto-recertification/index.ts` — PART 3: lógica de revalidação 45 dias com e-mail |

