

## Validacao do Fluxo IGA — Gaps Identificados

Analisei todo o codigo dos modulos envolvidos. O fluxo conceitual esta correto, mas existem **6 lacunas tecnicas** que impedem o funcionamento completo.

---

### Fluxo Esperado vs. Realidade

```text
SharePoint CSV → sync-sharepoint-csv → colaboradores → iam_queue (create) → AD
                                                      → cargo_perfis → provisionCargoAcessos → iam_queue (assign_group/license) → Entra ID

Terceiros → cadastro manual → iam_queue (create) → AD → provisionCargoAcessos → Entra ID
```

---

### Gap 1: sync-sharepoint-csv NAO gera iam_queue nem sam_account_name

O `sync-sharepoint-csv` tem sua propria funcao `buildColabData` (linha 218-231) que **nao inclui `sam_account_name`** e **nao gera entradas na `iam_queue`**. Apenas o `sync-csv-colab` faz isso.

**Correcao**: Alinhar `sync-sharepoint-csv` com `sync-csv-colab` — adicionar `sam_account_name` no `buildColabData` e gerar `iam_queue` entries para joiners, movers e leavers.

---

### Gap 2: Payload de create_if_not_exists com department/title/company = null

No `sync-csv-colab` (linhas 443-445), o payload de criacao envia `department: null`, `title: null`, `company: null` — apesar de ter esses dados no CSV. O `buildColabData` ja resolve os IDs de empresa/cargo/area, mas o payload do `iam_queue` nao usa os **nomes** dessas entidades.

**Correcao**: Resolver os nomes usando os caches (`empresaCache`, `cargoCache`, `areaCache`) e popular `department`, `title` e `company` com os valores textuais corretos.

---

### Gap 3: Movers (atualizacoes) NAO geram iam_queue

Quando um colaborador ja existente muda de cargo/area/status na importacao CSV, o sistema atualiza o registro mas **nao gera nenhuma entrada na `iam_queue`** para o agente AD/Entra ID. Apenas eventos JML sao registrados.

**Correcao**: Para cada `toUpdate`, comparar os campos alterados e gerar:
- `action_type: "update"` com `changed_fields` e `new_values` quando cargo/area mudam
- `action_type: "disable"` quando status muda para desligado/inativo

---

### Gap 4: Leavers NAO geram iam_queue (disable)

Colaboradores removidos do CSV sao deletados da tabela, mas **nenhuma solicitacao de desativacao e enviada ao AD**. O usuario continua ativo no AD.

**Correcao**: Antes de deletar, buscar o `sam_account_name` dos leavers e gerar `iam_queue` com `action_type: "disable"` para cada um.

---

### Gap 5: Importacao NAO dispara provisionCargoAcessos

O fluxo `cargo → perfil → grupos/licencas` so e executado manualmente no `ColaboradoresPage`. Na importacao, mesmo que o colaborador tenha um cargo com perfis configurados, **nenhuma atribuicao de perfil e criada e nenhuma iam_queue de grupo/licenca e gerada**.

**Correcao**: Apos inserir novos colaboradores, chamar a logica equivalente ao `provisionCargoAcessos` dentro da Edge Function (usando service_role). Para movers com cargo alterado, revogar perfis antigos e atribuir novos.

---

### Gap 6: Falta mecanismo para detectar replicacao AD → Entra ID

O fluxo assume que o agente AD cria o usuario e que um script separado replica para o Entra ID. Porem, **nao existe nenhum mecanismo no sistema para saber quando o usuario ja apareceu no Entra ID** e disparar a atribuicao de grupos/licencas.

**Opcoes**:
- **A) Provisionar imediatamente**: Gerar `assign_group`/`assign_license` logo apos o `create` e confiar que o agente PowerShell vai executar quando o usuario ja existir no Entra ID (com retry).
- **B) Novo action_type "provision_access"**: O agente, apos confirmar criacao no AD, retorna status e o sistema gera automaticamente os acessos Entra ID.

Recomendacao: **Opcao A** — mais simples. O agente faz retry ate o usuario aparecer no Entra ID.

---

### Resumo de Alteracoes

| Arquivo | O que corrigir |
|---|---|
| `supabase/functions/sync-sharepoint-csv/index.ts` | Adicionar `sam_account_name` no buildColabData; gerar iam_queue para joiners, movers e leavers |
| `supabase/functions/sync-csv-colab/index.ts` | Popular department/title/company no payload; gerar iam_queue para movers e leavers; disparar provisionamento de perfis/grupos/licencas para novos e movers |
| `supabase/functions/iam-agent-api/index.ts` | Sem alteracoes necessarias (ja suporta todos os action_types) |
| `src/lib/provisionCargoAcessos.ts` | Sem alteracoes (ja funciona corretamente quando chamado) |

### Ordem de implementacao

1. Corrigir payloads do `sync-csv-colab` (Gap 2)
2. Adicionar iam_queue para movers e leavers em ambas edge functions (Gaps 3 e 4)
3. Adicionar provisionamento de perfis na importacao (Gap 5)
4. Alinhar `sync-sharepoint-csv` com todas as correcoes (Gap 1)
5. Adotar estrategia de provisioning imediato para Entra ID (Gap 6)

