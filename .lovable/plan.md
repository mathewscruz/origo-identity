

## Plano: Adicionar logo Órigo em estados vazios de todo o sistema

### Abordagem

Criar um componente reutilizavel `EmptyState` que exibe o logo da Órigo em preto e branco (usando filtro CSS `grayscale`) ao lado da mensagem de "nenhum dado". Depois, substituir todas as ocorrencias de mensagens inline de empty state por esse componente.

### Alteracoes

**1. Copiar o logo para o projeto:**
- Copiar `user-uploads://origo_ENERGIA_mosca.png` para `src/assets/origo-logo.png`

**2. Criar componente `EmptyState` (`src/components/EmptyState.tsx`):**
- Props: `message: string`, `size?: "sm" | "md" | "lg"` (para adaptar a tabelas vs cards vs secoes)
- Exibe o logo em grayscale + opacity reduzida, proporcional ao tamanho do texto
- `sm`: logo 20px, texto `text-xs` (para celulas de tabela inline)
- `md`: logo 32px, texto `text-sm` (padrao para tabelas)
- `lg`: logo 48px, texto `text-base` (para cards e secoes grandes)
- Layout: flex horizontal centralizado (logo + texto)

**3. Substituir empty states em todos os modulos (~45 ocorrencias):**

| Arquivo | Quantidade |
|---|---|
| `Dashboard.tsx` | 4 |
| `AlertasPage.tsx` | 1 |
| `AplicacaoDetalhePage.tsx` | 4 |
| `AplicacoesPage.tsx` | 1 |
| `ColaboradorDetalhePage.tsx` | 3 |
| `ColaboradoresPage.tsx` | 1 |
| `CargosPage.tsx` | 1 |
| `IntegracoesPage.tsx` | 1 |
| `ExcecoesPage.tsx` | 1 |
| `FilaProvisionamentoPage.tsx` | 2 |
| `LicencasPage.tsx` | 1 |
| `PerfilAcessoDetalhePage.tsx` | 6 |
| `PerfisAcessoPage.tsx` | 3 |
| `PortalSolicitacoesPage.tsx` | 2 |
| `PrivilegiadosPage.tsx` | 2 |
| `RelatoriosPage.tsx` | 4 |
| `SoDPage.tsx` | 2 |
| `SolicitacoesPage.tsx` | 2 |
| `TerceiroDetalhePage.tsx` | 1 |
| `WorkflowPage.tsx` | 2 |
| `MatrizPage.tsx` | 1 |
| `RevisaoDetalhePage.tsx` | 1 |

Para celulas de tabela (`<td>`), o componente sera usado dentro do `<td>`. Para divs e cards, substitui o conteudo diretamente.

### Arquivos

| Acao | Arquivo |
|---|---|
| Copiar | Logo para `src/assets/origo-logo.png` |
| Criar | `src/components/EmptyState.tsx` |
| Editar | Todos os 22 arquivos listados acima |

