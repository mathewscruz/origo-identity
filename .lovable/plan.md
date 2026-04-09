

## Plano: Botao de sync em massa dos acessos Entra ID na pagina de Colaboradores

### O que sera feito

Adicionar um botao com icone de sync (RefreshCw) na area de acoes da pagina de Colaboradores. Ao clicar, o sistema itera por todos os colaboradores ativos que possuem email ou sam_account_name e chama a edge function `sync-user-access` para cada um, importando grupos, apps e licencas atuais do Entra ID.

### Alteracoes

**Editar `src/pages/colaboradores/ColaboradoresPage.tsx`:**

1. Importar `RefreshCw` do lucide-react
2. Adicionar estado `syncing` (boolean) para controlar loading
3. Criar funcao `handleSyncAll` que:
   - Filtra colaboradores ativos com email ou sam_account_name
   - Chama `sync-user-access` para cada colaborador em sequencia (com batch para nao sobrecarregar)
   - Mostra toast com progresso e resultado final
   - Invalida queries ao terminar
4. Adicionar o botao com icone `RefreshCw` (sem texto, apenas icone) ao lado dos botoes existentes, com tooltip "Sincronizar acessos do Entra ID"
5. Botao fica desabilitado e com animacao de spin enquanto `syncing` for true

### Detalhe tecnico

```tsx
// Na area de acoes (linha ~481)
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="outline" size="icon" disabled={syncing} onClick={handleSyncAll}>
      <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
    </Button>
  </TooltipTrigger>
  <TooltipContent>Sincronizar acessos do Entra ID</TooltipContent>
</Tooltip>
```

A funcao chamara a edge function em lotes de 5 colaboradores por vez (Promise.allSettled) para manter performance razoavel sem estourar limites.

### Arquivo

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` — botao sync + handler |

