

## Plano: Corrigir chamada de reprovisionamento ao editar perfil de acesso

### Diagnostico

Investiguei o problema e confirmei:

1. **A edge function `reprovision-entra-users` funciona corretamente** — testei com o `perfil_id` real e processou 2 usuarios com sucesso
2. **A chamada do frontend nao esta sendo disparada corretamente** — nenhuma requisicao de rede para `reprovision-entra-users` foi capturada. O problema esta no `PerfilAcessoDetalhePage.tsx`: a chamada `supabase.functions.invoke()` esta dentro de um `.then()` apos `setEditOpen(false)`, o que pode causar perda da promise durante o re-render causado pelo `invalidateQueries`
3. **Erros reais no Entra ID** (secundarios): alguns grupos sao "on-premises mastered" (nao podem ser alterados via Graph API) e alguns apps tem `entra_id` incorreto (service principal nao encontrado)

### Solucao

#### 1. `PerfilAcessoDetalhePage.tsx` — mover reprovision para antes do `setEditOpen(false)` e usar `await`

Tornar a chamada de reprovisionamento sincrona (awaited) dentro do bloco `try`, antes de fechar o dialog. Isso garante que a requisicao seja disparada antes de qualquer unmount/re-render.

#### 2. `CargosPage.tsx` — mesma correção

Mover o `await supabase.functions.invoke(...)` para dentro do fluxo sincrono do `handleSave`, antes de fechar o dialog.

#### 3. Adicionar logs de erro mais visiveis

Se a funcao retornar erros (grupos on-prem, apps com ID errado), mostrar um toast de aviso ao usuario com o numero de erros.

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` |
| Editar | `src/pages/configuracoes/CargosPage.tsx` |

