

## Plano: Adicionar campo samAccountName e corrigir payload de criacao

### O que muda

1. **Novo campo no formulario**: "Nome de login AD (samAccountName)" — obrigatorio para novos colaboradores.

2. **Payload `create` padronizado**: O `samAccountName` passa a vir do novo campo dedicado (nao mais da matricula). O `userPrincipalName` sera `samAccountName@ebessolar.local`.

3. **Mensagem ao salvar**: "Solicitacao enviada para processamento".

### Alteracoes no arquivo `ColaboradoresPage.tsx`

#### Interface `ColabForm`
- Adicionar campo `sam_account_name: string`

#### `emptyForm`
- Adicionar `sam_account_name: ""`

#### Validacao em `handleSave`
- Para novos colaboradores: exigir `sam_account_name` preenchido, mostrar toast de erro se vazio.

#### Payload `iam_queue` (action_type = "create", linhas 227-252)
- `samAccountName`: usar `form.sam_account_name.trim()`
- `userPrincipalName`: `form.sam_account_name.trim() + "@ebessolar.local"`
- `mail`: `form.email.trim() || null`
- `department`: nome da area (ja existe)
- `title`: nome do cargo (ja existe)
- `company`: nome da empresa (ja existe)
- `telephoneNumber`: `null`
- `manager`: `null`

#### Payload `iam_queue` para update/disable/delete
- Usar `form.sam_account_name` como `samAccountName` quando disponivel (fallback para matricula/email).

#### Formulario (dialog, linhas 465-531)
- Adicionar campo Input "Nome de login AD *" logo apos o campo Matricula.
- Mostrar apenas para novos colaboradores (ou sempre, para permitir edicao futura).

#### `openEdit`
- Nao ha `sam_account_name` na tabela `colaboradores` hoje. O campo ficara vazio na edicao (opcional nesse caso).

### Arquivo afetado

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` |

