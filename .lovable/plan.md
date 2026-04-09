

## Plano: Auditoria e ajuste do formulario de colaboradores + mapeamento CSV

### Analise do CSV vs Sistema

**Colunas do CSV (28 campos):**
`cn, company, description, displayName, employID, departmentNumber, givenName, L, mail, manager, name, physicalDeliveryOfficeName, sAMAccountName, sn, title, status, Cadastro_Pessoa_Fisica, Data_Nascimento, Data_Admissao, Bairro, CEP, Cidade, Complemento, Estado, Numero_Endereco, Rua, Base_Local, Data_Rescisao`

**Campos redundantes/desnecessarios no CSV:**
- `cn` = `displayName` = `name` (3 campos identicos — usar apenas `displayName`)
- `givenName` + `sn` sao derivados de `displayName` (desnecessarios como campos separados)
- `description` = `title` (cargo duplicado — ja tratado, usa `description || title`)
- `L` — vazio em praticamente todos os registros
- `physicalDeliveryOfficeName` — vazio
- `Bairro, CEP, Cidade, Complemento, Estado, Numero_Endereco, Rua` — dados de endereco pessoal que o sistema NAO armazena e nao precisa
- `manager` — campo vazio no CSV; o sistema tem `gestor_id` mas nao e populado pela importacao

**Campos uteis mapeados corretamente:**
- `displayName` → `nome` ✅
- `employID` → `matricula` ✅
- `mail` → `email` (com geracao automatica se nao @origoenergia) ✅
- `company` → `empresa_id` (lookup) ✅
- `description/title` → `cargo_id` (lookup) ✅
- `departmentNumber` → `area_id` (lookup) ✅
- `sAMAccountName` → `sam_account_name` ✅ (mas hoje o CSV importa derivando do email, nao do campo real)
- `status` → `status` (com mapeamento) ✅
- `Cadastro_Pessoa_Fisica` → `cpf` ✅
- `Data_Admissao` → `data_admissao` ✅
- `Data_Rescisao` → `data_desligamento` ✅
- `Base_Local` → `localidade_id` (lookup) ✅
- `Data_Nascimento` → **NAO mapeado** (sistema nao tem coluna, nao e critico)

### Problema encontrado: campo `sAMAccountName` do CSV ignorado

O CSV possui a coluna `sAMAccountName` mas a funcao `buildColabData` na edge function `sync-csv-colab` NAO a utiliza. Em vez disso, deriva o `sam_account_name` do email (parte antes do @). Isso significa que se o colaborador ja tem um sAMAccountName no AD diferente do prefixo do email, o sistema fica inconsistente.

### Problema encontrado: formulario manual nao auto-gera email/login

No formulario de terceiros, os campos email e login AD sao auto-gerados e bloqueados. No formulario de colaboradores, esses campos sao editaveis manualmente, o que contradiz o pedido do usuario.

---

### Alteracoes

**1. Editar `src/pages/colaboradores/ColaboradoresPage.tsx` — formulario de criacao:**

- Adicionar `useEffect` que gera automaticamente email e sam_account_name quando o nome muda (igual aos terceiros), usando a logica `nome.sobrenome@origoenergia.com.br`
- Tornar os campos Email e Login AD `readOnly disabled className="bg-muted cursor-not-allowed"` (iguais ao padrao de terceiros)
- Remover validacao que exige sam_account_name manual (ja sera preenchido automaticamente)
- Na edicao, manter os campos bloqueados tambem (valores ja existentes)

**2. Editar `supabase/functions/sync-csv-colab/index.ts` — usar sAMAccountName do CSV:**

- No `buildColabData`, priorizar o campo `sAMAccountName` do CSV quando disponivel
- Se o CSV tiver `sAMAccountName` preenchido, usar esse valor diretamente para `sam_account_name`
- Manter a logica de fallback atual (derivar do email) apenas quando o campo CSV estiver vazio
- Garantir que a geracao de email corporativo continua funcionando para emails nao-@origoenergia

**3. Validacao de campos preenchidos na importacao:**

- Os campos REQUIRED_HEADERS ja cobrem os essenciais
- Adicionar `sAMAccountName` como header opcional mapeado (nao obrigatorio, pois muitos registros podem nao ter)
- Garantir que `Data_Nascimento` nao causa erro (ja e ignorado, ok)
- Os campos de endereco (Bairro, CEP etc) continuam ignorados corretamente

### Logica de auto-geracao no formulario

```typescript
useEffect(() => {
  if (editingId) return; // So auto-gera para novos
  const nome = form.nome.trim();
  if (!nome) { setForm(prev => ({ ...prev, email: "", sam_account_name: "" })); return; }
  const parts = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .split(/\s+/).filter(p => !["de","da","do","dos","das","e"].includes(p) && p.length > 0);
  if (parts.length === 0) return;
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : first;
  const sam = `${first}.${last}`;
  const email = `${sam}@origoenergia.com.br`;
  setForm(prev => ({ ...prev, email, sam_account_name: sam }));
}, [form.nome, editingId]);
```

### Arquivos

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` — bloquear campos email/login AD + auto-gerar |
| Editar | `supabase/functions/sync-csv-colab/index.ts` — usar sAMAccountName do CSV quando disponivel |

