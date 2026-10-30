# Ficha de Colaboradores e Terceiros — visual "Cabeçalho escuro" (opção C)

## O que muda para você
- **Cabeçalho escuro** no topo da ficha: foto, nome completo, etiqueta (Colaborador / Terceiro), cargo ou empresa e situação.
- **Destaque à direita do cabeçalho**:
  - Terceiro: anel circular "Revalidação em X dias" (verde, amarelo com 15 dias ou menos, vermelho se vencida).
  - Colaborador: anel com tempo de casa ou situação da conta Entra (ativa/desabilitada).
- **Abas logo abaixo**: Resumo · Acessos · Histórico · Revalidações (só terceiros) — mantendo o conteúdo que já existe hoje nas fichas.
- **Aba Resumo em duas colunas**:
  - Esquerda: "Dados do colaborador/terceiro" em lista rótulo → valor (matrícula, e-mail, gestor, local, admissão, contrato etc.).
  - Direita: "Resumo de acessos" com 3 contadores (Grupos, Licenças, Aplicações), grupos e licenças em etiquetas e aplicações com logo.
- Ações (Desligar, Editar, Reenviar etc.) ficam no cabeçalho, com a janela de confirmação de impacto que já existe.
- O painel lateral da lista de Colaboradores ganha o mesmo cabeçalho escuro compacto, para ficar coerente.

## Fora do escopo
- Nenhuma regra, permissão ou dado muda; só a apresentação. Contas de serviço ficam para depois, se aprovado.

## Detalhes técnicos
- Novo componente compartilhado `src/components/identity/IdentityHeader.tsx` (cabeçalho escuro + anel `ProgressRing`) e `AccessSummaryCard.tsx` (contadores + chips via `useEffectiveAccess`).
- Tokens novos em `index.css`: `--header-dark`, `--header-dark-foreground` (sem cores fixas).
- Refatorar `ColaboradorDetalhePage.tsx`, `TerceiroDetalhePage.tsx` e `ColaboradorPanel.tsx` para usar esses componentes; abas reorganizadas sem remover seções.
- Teste pequeno para a regra de cor do anel de revalidação (≤15 dias amarelo, vencida vermelho).
- Verificação via Playwright nas duas fichas.
