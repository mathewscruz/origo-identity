

## Plano: Lifecycle completo para colaboradores manuais

### Escopo

Apenas colaboradores com `origem === "manual"` serao afetados. Colaboradores importados (csv, entra_id) continuam sem alteracao.

### Mudancas

#### 1. `ColaboradoresPage.tsx` — handleSave com lifecycle completo

Apos salvar um colaborador **manual**:
- **Novo colaborador**: gerar evento JML tipo `joiner` + provisionar acessos do cargo (ja faz)
- **Cargo mudou**: gerar evento JML tipo `mover` + provisionar acessos (ja faz cargo, falta JML)
- **Area mudou**: gerar evento JML tipo `mover`
- **Status mudou para != ativo**: chamar `disableEntraUser(id, "disable")` para desativar no Entra ID e revogar acessos + gerar evento JML tipo `leaver`
- **Status mudou para ativo (vindo de inativo/desligado)**: chamar `disableEntraUser(id, "enable")` + re-provisionar acessos do cargo + gerar evento JML tipo `joiner`

Guardar o status anterior (`editingStatus`) ao abrir o dialog de edicao para detectar mudancas.

#### 2. `ColaboradorDetalhePage.tsx` — status change com re-provisionamento (so manual)

Ao mudar status no dropdown, verificar se `pessoa.origem === "manual"`:
- Se sim e mudou para "ativo": alem de chamar `disableEntraUser(enable)`, tambem chamar `provisionCargoAcessos` para re-conceder perfis do cargo atual
- Se nao for manual: manter comportamento atual (so Entra ID)

#### 3. Nova funcao utilitaria `createEventoJML` em `src/lib/createEventoJML.ts`

```typescript
export async function createEventoJML(params: {
  colaboradorId: string;
  colaboradorNome: string;
  tipo: "joiner" | "mover" | "leaver";
  dadosAntes?: Record<string, any>;
  dadosDepois?: Record<string, any>;
})
```

Insere em `eventos_jml` com `origem: "manual"`, `status: "concluido"`.

#### 4. `provisionCargoAcessos.ts` — sem alteracao

Ja funciona para o caso de novo cargo e revogacao do antigo. Nenhuma mudanca necessaria.

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Criar | `src/lib/createEventoJML.ts` |
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` |
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` |

