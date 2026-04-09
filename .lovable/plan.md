

## Plano: Usuários/grupos por app via iam_queue + Owner como select de colaboradores + Workflow de aprovação pelo owner

### Contexto atual

- A aba "Usuários" na página de detalhe da aplicação mostra apenas colaboradores vinculados via **perfis de acesso** (perfil_atribuicoes → perfil_aplicacoes). Não mostra quem tem acesso individual (via iam_queue/sync).
- O campo **Owner** é texto livre (string na coluna `aplicacoes.owner`).
- Quando um usuário solicita acesso a um app, a notificação vai para **todos os admins**, não para o owner do app.

### O que será feito

**1. Mostrar usuários reais atrelados ao app (via iam_queue)**

Adicionar uma nova query que busca da `iam_queue` todos os registros `assign_app` com status `completed` cujo `payload_json->app_name` ou `payload_json->app_id` corresponde ao app atual. Isso mostra quem realmente tem o app provisionado, além dos que vieram por perfil.

A aba "Usuários" passará a ter duas sub-seções ou será enriquecida com dados da iam_queue (sem duplicar quem já aparece via perfil).

**2. Mostrar grupos vinculados ao app (via iam_queue)**

Similar ao item 1, buscar `assign_group` completados vinculados a este app (via perfil_grupos do perfil que contém este app). Manter a aba Grupos existente e enriquecê-la.

**3. Owner como select pesquisável de colaboradores**

- Trocar o campo Owner no header por um componente `Popover` + `Command` (combobox pesquisável) que lista todos os colaboradores ativos
- Ao selecionar, salva o `colaborador_id` como owner (continuará usando a coluna `owner` como texto, gravando `nome - email` ou apenas o email para manter compatibilidade)
- Exibir o owner selecionado com nome e e-mail

**4. Workflow de aprovação por e-mail para o Owner**

Quando um usuário solicita acesso a um app que tem owner definido:
- Na `SolicitacoesPage` e `PortalSolicitacoesPage`, ao criar a solicitação, verificar se o app solicitado tem owner
- Se tiver, enviar e-mail de notificação (`solicitacao_criada`) para o e-mail do owner
- O owner recebe o e-mail e pode acessar o painel para aprovar/reprovar
- Manter o fluxo existente de notificação aos admins como fallback quando não há owner

### Detalhes técnicos

**Owner Combobox:**
```tsx
// Usar Command (cmdk) dentro de Popover para busca
<Popover>
  <PopoverTrigger>
    <Button variant="outline">{ownerDisplay || "Selecionar owner..."}</Button>
  </PopoverTrigger>
  <PopoverContent>
    <Command>
      <CommandInput placeholder="Buscar colaborador..." />
      <CommandList>
        {colaboradores.map(c => <CommandItem onSelect={...} />)}
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

**Notificação ao Owner na criação de solicitação:**
- Buscar `aplicacoes.owner` para cada app solicitado
- Extrair e-mail do owner (que será o e-mail do colaborador)
- Chamar `sendNotificationEmail("solicitacao_criada", { destinatario_email: ownerEmail, ... })`

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/pages/aplicacoes/AplicacaoDetalhePage.tsx` — combobox owner + query iam_queue para usuários reais |
| Editar | `src/pages/solicitacoes/SolicitacoesPage.tsx` — enviar e-mail ao owner do app |
| Editar | `src/pages/portal/PortalSolicitacoesPage.tsx` — enviar e-mail ao owner do app |

