

## Plano: Fluxo completo de Desativação e Reativação (Colaboradores + Terceiros)

### Problemas encontrados

**Colaborador — Desativação:**
- Remove recursos de perfis (grupos/licenças/apps via `queueFullProfileActions`)
- Envia `disable` (AD) + `disable_entra`
- **NAO remove** recursos individuais (atribuídos via `manual_individual`)

**Colaborador — Reativação:**
- Envia `enable_entra` + `update` (AD)
- Re-provisiona perfis via `provisionCargoAcessos` mas **somente se manual + tem cargo**
- **NAO re-provisiona** recursos individuais removidos

**Terceiro — Desativação (botão "Desligar"):**
- Revoga perfil_atribuicoes e remove recursos via `queueFullProfileActions`
- **NAO envia** `disable_entra` nem `disable` (AD)
- **NAO remove** recursos individuais

**Terceiro — Reativação:**
- **NAO existe** — não há botão "Reativar" quando `ativo = false`

**TerceirosPage.tsx (edição inline via Switch "Ativo"):**
- Desativar: envia `disable` AD mas **NAO remove** grupos/licenças/apps nem `disable_entra`
- Reativar: **nada acontece**

---

### Correções

**1. Colaborador — Desativação completa:**
- Além dos recursos de perfil, buscar também itens individuais da `iam_queue` com `requested_by = 'manual_individual'` e `status = 'success'` para gerar ações de remoção inversa
- Salvar os IDs dos recursos individuais removidos em `payload_json` do evento JML para poder restaurá-los na reativação

**2. Colaborador — Reativação completa:**
- Sempre chamar `provisionCargoAcessos` se houver `cargo_id` (não apenas se `isManual`)
- Buscar recursos individuais que foram removidos na desativação (do evento JML leaver mais recente) e re-atribuí-los

**3. Terceiro — Desativação completa (TerceiroDetalhePage):**
- Adicionar `disable` (AD) + `disable_entra` ao fluxo de `handleDesligar`
- Buscar e remover recursos individuais

**4. Terceiro — Reativação (TerceiroDetalhePage):**
- Adicionar botão "Reativar Terceiro" quando `ativo = false`
- Fluxo: atualizar `ativo = true`, enviar `enable_entra`, re-provisionar perfis e recursos individuais salvos, criar evento JML "joiner"

**5. TerceirosPage.tsx (edição inline):**
- Desativar via Switch: alinhar com o fluxo completo (remover recursos + disable_entra)
- Reativar via Switch: alinhar com reativação completa

---

### Detalhes de implementação

**Armazenamento de recursos para restauração:**
No momento da desativação, gravar no `dados_antes` do evento JML leaver a lista de recursos individuais ativos (`action_type`, `payload_json`, `target_identity`). Na reativação, ler esse evento e re-criar as ações de `assign`.

**Fluxo de reativação (ambos):**
```text
Reativar →
  1. Update status para ativo
  2. Enviar enable_entra + update (AD)
  3. Re-provisionar perfis do cargo (provisionCargoAcessos)
  4. Buscar último evento JML leaver e restaurar recursos individuais
  5. Criar evento JML joiner
  6. Audit log + alerta
  7. triggerEntraProcessing()
```

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/pages/colaboradores/ColaboradorDetalhePage.tsx` — desativação: incluir individuais + salvar no JML; reativação: restaurar individuais |
| Editar | `src/pages/terceiros/TerceiroDetalhePage.tsx` — desativação: AD + Entra + individuais; adicionar botão e fluxo de reativação |
| Editar | `src/pages/terceiros/TerceirosPage.tsx` — alinhar Switch ativo/inativo com fluxo completo |

