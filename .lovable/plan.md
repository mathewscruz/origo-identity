

## Plano: Garantir que nenhuma sincronização automática do SharePoint está ativa

### Diagnóstico

A migração `20260407120212` já executou:
```sql
SELECT cron.unschedule('sync-csv-diario');
SELECT cron.unschedule('process-entra-queue-every-5min');
```

Nenhuma migração posterior re-agendou esses jobs. A função `sync-sharepoint-csv` é chamada apenas manualmente pelo botão "Buscar Dados do SharePoint" na página de Integrações. Teoricamente, não há sincronização automática ativa.

Porém, como não é possível consultar `cron.job` diretamente para confirmar, a sincronização de ontem pode ter sido:
1. Alguém clicou no botão manualmente
2. O cron ainda estava ativo antes da migração ser aplicada

### Solução

Criar uma migração de segurança que:
1. Remove **todos** os cron jobs conhecidos (idempotente — ignora se já removidos)
2. Lista os jobs restantes para log de auditoria

### Migração

```sql
-- Safety: ensure all known cron jobs are removed
DO $$
BEGIN
  PERFORM cron.unschedule('sync-csv-diario');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('process-entra-queue-every-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Remove any other potential SharePoint-related jobs
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT jobname FROM cron.job WHERE command ILIKE '%sync-sharepoint%' OR command ILIKE '%sync-csv%'
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
```

### Arquivos

| Acao | Arquivo |
|---|---|
| Migração | Remover qualquer cron job residual de sincronização SharePoint/CSV |

