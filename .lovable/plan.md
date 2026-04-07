

## Plano: Corrigir sincronização para trazer apenas os 498 apps empresariais reais

### Causa raiz

A Edge Function busca **todos os Service Principals** com a tag `WindowsAzureActiveDirectoryIntegratedApp`, sem filtrar por tipo. Isso inclui:
- Apps Microsoft internos/first-party (Office 365, Azure AD, etc.)
- Service Principals do tipo `ManagedIdentity` e `Legacy`
- Apps que não aparecem na view "Aplicativos Empresariais" do Azure

O portal Azure filtra automaticamente por `servicePrincipalType eq 'Application'` e exclui apps first-party da Microsoft (tenant `f8cdef31-a31e-4b4a-93e4-5f571e91255a`).

### Correções

**Arquivo:** `supabase/functions/sync-entra-apps/index.ts`

1. Adicionar filtro `servicePrincipalType eq 'Application'` na query do Graph API
2. Excluir apps cujo `appOwnerOrganizationId` seja o tenant da Microsoft (`f8cdef31-a31e-4b4a-93e4-5f571e91255a`)
3. Incluir `appOwnerOrganizationId` no `$select` para poder filtrar

Query corrigida:
```
/servicePrincipals?$filter=tags/any(t: t eq 'WindowsAzureActiveDirectoryIntegratedApp') and servicePrincipalType eq 'Application'&$select=id,displayName,appId,servicePrincipalType,appOwnerOrganizationId&$top=999
```

E no código, após o fetch, filtrar client-side os apps da Microsoft:
```typescript
const filtered = servicePrincipals.filter(sp => 
  sp.appOwnerOrganizationId !== 'f8cdef31-a31e-4b4a-93e4-5f571e91255a'
);
```

**Limpeza do banco:** Executar SQL para remover os apps Azure que foram importados indevidamente (os que não existem mais após o filtro correto). A Edge Function fará isso automaticamente: apps com `origem = 'azure'` cujo `entra_id` não está na lista filtrada serão removidos (soft-delete ou hard-delete).

### Lógica de limpeza na Edge Function

Após o sync, adicionar um passo final:
- Coletar todos os `entra_id` dos SPs filtrados
- Buscar no banco todos os apps com `origem = 'azure'`
- Deletar os que têm `entra_id` ausente na lista do Azure (foram importados por engano)
- Isso alinhará o número no sistema com o Azure (≈498)

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `supabase/functions/sync-entra-apps/index.ts` — filtro + limpeza |

