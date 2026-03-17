

## Plano: Remover colaboradores Entra ID + Rotina diaria SharePoint

### 1. Remover 1335 colaboradores de origem `entra_id`

Executar via insert tool (data operation):
- Marcar todos como `status='inativo'`, `origem='obsoleto'`
- Registrar em `auditoria`
- Criar alerta informativo

### 2. Criar edge function `sync-sharepoint-csv`

Nova funcao que:
- Autentica no Microsoft Graph com as credenciais Azure ja configuradas (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)
- Acessa o site SharePoint `origoenergia.sharepoint.com/sites/dataanalytics`
- Lista arquivos na pasta `/Shared Documents/RH_COLAB`
- Filtra arquivos com prefixo `base_colab_`, ordena por data no nome (ou `lastModifiedDateTime`), pega o mais recente
- Baixa o conteudo do CSV
- Chama internamente a logica do `sync-csv-colab` existente (reutiliza parsing + diff + JML)

Abordagem tecnica: a funcao `sync-sharepoint-csv` faz o download do CSV via Graph API e depois chama `sync-csv-colab` via HTTP passando o CSV como body FormData — reutilizando toda a logica ja implementada.

Graph API endpoints:
```
GET /sites/{site-id}/drive/root:/RH_COLAB:/children
```
Para resolver o site-id: `GET /sites/origoenergia.sharepoint.com:/sites/dataanalytics`

### 3. Criar cron job diario

Usar `pg_cron` + `pg_net` para agendar execucao diaria (ex: 06:00 UTC):
```sql
SELECT cron.schedule('sync-csv-diario', '0 6 * * *', $$
  SELECT net.http_post(
    url:='https://jobopjhhxgcfanlhzlkc.supabase.co/functions/v1/sync-sharepoint-csv',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
$$);
```

### 4. Atualizar config.toml

Adicionar `sync-sharepoint-csv` com `verify_jwt = false`.

### 5. Atualizar IntegracoesPage

- Adicionar card "Sincronizacao Automatica SharePoint" mostrando status da rotina diaria
- Botao "Executar Agora" para disparar manualmente a busca do SharePoint
- Mostrar ultimo arquivo processado e horario

### 6. Salvar parametros SharePoint

Inserir na tabela `parametros`:
- `sharepoint_site_path` = `origoenergia.sharepoint.com:/sites/dataanalytics`
- `sharepoint_folder_path` = `RH_COLAB`
- `csv_colab_prefix` = `base_colab_`

---

### Requisitos Azure

As credenciais Azure ja existem como secrets. Sera necessario garantir que o App Registration tenha a permissao `Sites.Read.All` no Microsoft Graph para acessar o SharePoint. Isso e configurado no portal Azure (fora do Lovable).

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Criar | `supabase/functions/sync-sharepoint-csv/index.ts` |
| Editar | `supabase/config.toml` |
| Editar | `src/pages/configuracoes/IntegracoesPage.tsx` |
| SQL (insert tool) | Marcar 1335 entra_id como obsoletos |
| SQL (insert tool) | Habilitar pg_cron + pg_net, criar cron schedule |
| SQL (insert tool) | Inserir parametros SharePoint |

