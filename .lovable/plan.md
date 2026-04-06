

## Plano: Gerar diff de mudancas ao editar perfil de acesso e reprovisionar no Entra ID

### Problema

Quando voce edita um perfil de acesso (adiciona ou remove grupos, licencas ou apps), o codigo atual em `PerfilAcessoDetalhePage.tsx` so gera entradas `assign_*` para o estado novo. Ele nunca gera entradas `remove_*` para os itens que foram removidos. Alem disso, re-envia assigns para itens que ja existiam, gerando trabalho desnecessario.

O sistema precisa calcular o **diff** entre o estado anterior e o novo, e gerar:
- `remove_group` / `remove_license` / `remove_app` para itens removidos
- `assign_group` / `assign_license` / `assign_app` apenas para itens adicionados

### Correcao

**Arquivo:** `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx`

Na funcao `handleSaveEdit`, antes de fazer o delete+insert das tabelas de vinculo (`perfil_grupos`, `perfil_licencas`, `perfil_aplicacoes`), capturar o estado anterior (que ja esta disponivel em `perfilGrupos`, `perfilLicencas`, `perfilApps`).

Depois de salvar, calcular:
- **Grupos adicionados** = `editForm.grupo_ids` que nao estavam em `perfilGrupos`
- **Grupos removidos** = IDs que estavam em `perfilGrupos` mas nao estao em `editForm.grupo_ids`
- Mesma logica para licencas e apps

Para cada colaborador com atribuicao ativa neste perfil:
- Gerar `assign_group` apenas para grupos adicionados
- Gerar `remove_group` apenas para grupos removidos
- Idem para licencas e apps

Depois, chamar `triggerEntraProcessing()` para processar imediatamente.

### Detalhes tecnicos

```text
Antes (estado atual):
editar perfil -> salva novos vinculos
-> gera assign_* para TODOS os itens novos (sem removes)
-> itens removidos ficam no Entra ID sem ser revogados

Depois:
editar perfil -> captura estado anterior
-> salva novos vinculos
-> calcula diff (adicionados vs removidos)
-> gera assign_* so para adicionados
-> gera remove_* para removidos
-> triggerEntraProcessing() executa imediatamente
```

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` — calcular diff e gerar remove/assign corretos |

