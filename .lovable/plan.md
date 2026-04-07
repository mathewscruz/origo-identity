

## Plano: Link portal externo + Remover criar conta

### 1. Link para portal externo de solicitações (`SolicitacoesPage.tsx`)

Adicionar um botão ao lado do "Nova Solicitação" no cabeçalho da página com ícone `ExternalLink`, apontando para `https://iam.origoenergia.com.br/solicitacoes` abrindo em nova aba.

### 2. Remover opção de criar conta (`LoginPage.tsx`)

- Remover linha 106 (botão "Criar conta")
- Remover state `nome`, modo `"signup"`, função `handleSignup` e campos relacionados
- Limpar referências a signup no título/descrição/botão submit

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/pages/solicitacoes/SolicitacoesPage.tsx` — botão "Portal Externo" com link `https://iam.origoenergia.com.br/solicitacoes` |
| Editar | `src/pages/auth/LoginPage.tsx` — remover todo o fluxo de signup |

