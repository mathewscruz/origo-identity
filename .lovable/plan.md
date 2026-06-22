## Correções no mapa de SKUs e na heurística de trial

### 1. Corrigir mapeamentos errados (`_shared/m365SkuNames.ts`)
- `SPE_F1` → **"Microsoft 365 F3"** (estava "F1"). Verdade Microsoft: `SPE_F1` é o partNumber do plano F3 desde o rebrand de abril/2020.
- `M365_F1` → **"Microsoft 365 F1"** (já está, manter).
- `Microsoft_Teams_Exploratory_Dept` → **"Microsoft Teams Exploratory (for Departments)"** (mais preciso).

### 2. Adicionar entradas faltantes vistas no tenant
- `SPB` → "Microsoft 365 Business Premium"
- `SHAREPOINTSTORAGE` → "Office 365 Extra File Storage"
- `WINDOWS_STORE` → "Windows Store for Business"
- `Teams_Premium_(for_Departments)` → "Microsoft Teams Premium (for Departments)"
- `PROJECT_PLAN3_DEPT` → "Project Plan 3 (for Departments)"
- Também adicionar de uma vez os irmãos comuns: `SMB_BUSINESS_ESSENTIALS` ("Microsoft 365 Business Basic"), `SMB_BUSINESS` ("Microsoft 365 Business Standard"), `O365_BUSINESS_PREMIUM` (já existe), `WIN_DEF_ATP` ("Microsoft Defender for Endpoint Plan 2"), `ATP_ENTERPRISE` ("Microsoft Defender for Office 365 P1"), `THREAT_INTELLIGENCE` ("Microsoft Defender for Office 365 P2"), `IDENTITY_THREAT_PROTECTION` ("Microsoft 365 E5 Security"), `ADALLOM_S_STANDALONE` ("Microsoft Defender for Cloud Apps").

### 3. Ajustar heurística `isTrialSku`
Adicionar `_IW` (Info Worker = self-service trial) ao regex:
```
/(VIRAL|TRIAL|FREE|vTrial|_DEV|_IW)/i
```
Isso captura `D365_SALES_PRO_IW`, `D365_CUSTOMER_SERVICE_PRO_IW`, etc., independente do consumo.

### 4. Refletir nas linhas já sincronizadas
A migração executa um `UPDATE` único reaplicando o mapa atualizado nas linhas existentes (sem precisar rodar o sync de novo):
```sql
UPDATE public.entra_licencas SET
  friendly_name = CASE nome
    WHEN 'SPE_F1' THEN 'Microsoft 365 F3'
    WHEN 'SPB' THEN 'Microsoft 365 Business Premium'
    WHEN 'SHAREPOINTSTORAGE' THEN 'Office 365 Extra File Storage'
    WHEN 'WINDOWS_STORE' THEN 'Windows Store for Business'
    WHEN 'Teams_Premium_(for_Departments)' THEN 'Microsoft Teams Premium (for Departments)'
    WHEN 'PROJECT_PLAN3_DEPT' THEN 'Project Plan 3 (for Departments)'
    WHEN 'Microsoft_Teams_Exploratory_Dept' THEN 'Microsoft Teams Exploratory (for Departments)'
    ELSE friendly_name
  END,
  is_trial = CASE WHEN nome ILIKE '%\_IW' ESCAPE '\' THEN true ELSE is_trial END;
```

### 5. Fora de escopo
- `SPE_E3` aparece com `em_uso=350` e `total=268` (excedido em 82) — é dado real do tenant, não bug. A UI já exibe badge "Excedido".
- Outros add-ons internos com `total=0` (Visio, Power Automate RPA) representam SKUs sem pool comprado mas com licenças individuais herdadas. Comportamento correto.

Confirma para eu aplicar?
