

## Plano: Gerar e-mail corporativo Órigo para colaboradores com e-mail genérico

### Problema

Colaboradores importados via CSV podem vir com e-mails genéricos (ex: `joao@gmail.com`, sem domínio `@origoenergia.com.br`). O sistema precisa detectar esses casos e gerar automaticamente o e-mail corporativo no padrão `nome.sobrenome@origoenergia.com.br`, validando unicidade.

### Lógica de geração

```text
1. Detectar se o e-mail do CSV NÃO é @origoenergia.com.br
2. Extrair nome completo (displayName): "João Carlos Silva"
3. Gerar: joao.silva@origoenergia.com.br (primeiro.último)
4. Verificar no banco se já existe colaborador com esse e-mail
5. Se existir duplicata: joao.carlos@origoenergia.com.br (primeiro.meio)
6. Se ainda existir: joao.carlos.silva@origoenergia.com.br (completo)
7. Atualizar sam_account_name para o prefixo do e-mail gerado
```

### Normalização

- Converter para minúsculas
- Remover acentos (João → joao, André → andre)
- Tratar nomes compostos com preposições (da, de, do, dos, das) — ignorar na composição

### Alterações

**1. `supabase/functions/sync-csv-colab/index.ts` — função `buildColabData`:**

Adicionar função `generateOrigoEmail(displayName, existingEmails)`:
- Recebe o nome completo e um Set de e-mails já existentes no banco
- Retorna o e-mail corporativo gerado
- Antes do loop de classificação, carregar todos os e-mails existentes de colaboradores num Set
- Na função `buildColabData`, se `row.mail` não termina com `@origoenergia.com.br`, chamar `generateOrigoEmail` e usar o resultado como `email` e derivar o `sam_account_name` dele
- Adicionar cada e-mail gerado ao Set para evitar colisão entre registros do mesmo CSV

**2. `src/pages/colaboradores/ColaboradoresPage.tsx` — indicador visual:**

Adicionar ícone/badge na listagem para sinalizar colaboradores cujo e-mail foi gerado automaticamente (quando o e-mail original do CSV difere do e-mail no banco)

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `supabase/functions/sync-csv-colab/index.ts` — lógica de geração de e-mail corporativo |
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` — indicador visual (opcional) |

