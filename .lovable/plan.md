

## Plano: Equalizar status CSV com o sistema e ajustar ações por tipo

### Status encontrados no CSV
- `Ativo` → `ativo`
- `Demitido` → `desligado`
- `Férias` → `ferias`
- (Provavelmente) `Afastado`, `Inativo`, `Suspenso`, `Licença`, `Aposentado`, `Transferido`

### Status do sistema (enum `status_colaborador`)
`ativo`, `inativo`, `ferias`, `afastado`, `desligado`

### Mapeamento atual (`STATUS_MAP`) — já correto
```
ativo → ativo
demitido → desligado
desligado → desligado
afastado → afastado
férias → ferias
ferias → ferias
inativo → inativo
suspenso → afastado
licenca → afastado
licença → afastado
aposentado → desligado
transferido → ativo
```

### Problema identificado

A lógica de desativação na importação CSV (linha 826) só trata `desligado` e `inativo`:
```typescript
const isDisabling = (newStatus === "desligado" || newStatus === "inativo") && oldStatus !== newStatus;
```

**Férias e afastado não disparam nenhuma ação** — o colaborador continua com conta habilitada.

### Regras solicitadas

| Status | Conta AD/Entra | Grupos/Licenças/Apps |
|--------|---------------|---------------------|
| `desligado` / `inativo` | Desabilitar | Remover tudo |
| `ferias` / `afastado` | Desabilitar | Manter tudo |
| `ativo` (vindo de férias/afastado) | Reabilitar | Manter (já existem) |

### Alterações

**Editar `supabase/functions/sync-csv-colab/index.ts`:**

1. Criar uma nova classificação tripartida no bloco de update (linha ~824):
   - `isFullDisable` = `desligado` ou `inativo` → desabilita AD + Entra + remove todos os acessos (comportamento atual)
   - `isSoftDisable` = `ferias` ou `afastado` → desabilita AD + Entra mas **não** remove grupos/licenças/apps
   - `isReactivating` = status antigo era `ferias`/`afastado`/`desligado`/`inativo` e novo é `ativo` → reabilita conta (gera `enable_entra`)

2. Para `isSoftDisable`: gerar apenas `disable` (AD) + `disable_entra` — sem chamar `provisionCargoAcessosServer` nem `queueProfileAccess` para remover recursos.

3. Para `isReactivating`: gerar `enable_entra` para reabilitar a conta no Entra ID quando o colaborador volta de férias/afastamento.

4. A lógica de leavers (ausentes no CSV, linha ~649) permanece como está — remove tudo e desabilita (tratamento mais agressivo para quem sumiu do CSV).

**Editar `src/pages/colaboradores/ColaboradorDetalhePage.tsx` (se aplicável):**

Garantir que a ação manual de desativar/reativar na UI segue as mesmas regras (verificar se já segue).

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `supabase/functions/sync-csv-colab/index.ts` — separar lógica de disable total vs parcial + reativação |

