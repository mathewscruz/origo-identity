

## Plano: Padronizar payloads da iam_queue para consistencia com o AD

### Problema

Os payloads atuais usam fallbacks para matricula/email em `samAccountName` e `target_identity`, e faltam campos obrigatorios como `mail`, `status`, `changed_fields`, `new_values`, `status_anterior` e `status_novo`.

### Alteracoes em `ColaboradoresPage.tsx`

#### 1. Regra de identidade (todas as acoes)
- `target_identity` = `form.sam_account_name.trim()` — sem fallback para matricula ou email
- `payload_json.samAccountName` = mesmo valor — sem fallback

#### 2. Payload `create` (linhas 238-257)
Manter estrutura atual, ja esta correta. Apenas garantir que nao ha fallback.

#### 3. Payload `disable` (linhas 193-207)
Adicionar campos obrigatorios:
```
samAccountName, mail, displayName, status: "disabled",
status_anterior, status_novo, changed_fields: ["status"],
new_values: { status: "disabled" }
```

#### 4. Payload `update` para reativacao (linhas 210-222)
Reformular:
```
samAccountName, mail, displayName, status: "enabled",
status_anterior: "disabled", status_novo: "enabled",
changed_fields: ["status"], new_values: { status: "enabled" }
```

#### 5. Payload `update` para cargo/area (linhas 267-277)
Adicionar campos obrigatorios:
```
samAccountName (sem fallback), mail, displayName, status: "enabled",
changed_fields: ["title", "department"] (conforme mudou),
new_values: { title: "...", department: "..." }
```

### Exemplos de payload resultantes

**create:**
```json
{
  "givenName": "João",
  "surname": "Silva Santos",
  "displayName": "João Silva Santos",
  "samAccountName": "joao.santos",
  "userPrincipalName": "joao.santos@ebessolar.local",
  "mail": "joao.santos@ebes.com.br",
  "department": "TI",
  "title": "Analista de Sistemas",
  "company": "EBES Solar",
  "telephoneNumber": null,
  "manager": null,
  "ouPath": ""
}
```

**update (cargo/area):**
```json
{
  "samAccountName": "joao.santos",
  "mail": "joao.santos@ebes.com.br",
  "displayName": "João Silva Santos",
  "status": "enabled",
  "changed_fields": ["title", "department"],
  "new_values": {
    "title": "Coordenador de TI",
    "department": "Infraestrutura"
  }
}
```

**disable:**
```json
{
  "samAccountName": "joao.santos",
  "mail": "joao.santos@ebes.com.br",
  "displayName": "João Silva Santos",
  "status": "disabled",
  "status_anterior": "ativo",
  "status_novo": "inativo",
  "changed_fields": ["status"],
  "new_values": { "status": "disabled" }
}
```

### Arquivo afetado

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` |

