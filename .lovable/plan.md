

## Plano: Melhorias no módulo de Revisões de Acesso

### Problemas identificados

**1. E-mail não é enviado de verdade**
A Edge Function `send-review-email` apenas faz `console.log` e registra na auditoria. O owner nunca recebe o link. Precisa integrar com um serviço de e-mail real.

**2. URL do link externo está errada na Edge Function**
A linha `reviewUrl` faz `.replace('.supabase.co', '')` o que gera uma URL inválida. Deveria usar a URL real do app (ex: `https://origo-identity.lovable.app`).

**3. Revogação na página externa não remove apps**
O `handleSave` da `RevisaoExternaPage` gera `remove_group` e `remove_license` mas **não gera `remove_app`**. Apps ficam órfãos no Entra ID.

**4. Não existe ação em massa na página externa**
O owner precisa clicar um a um em cada pessoa. Com dezenas ou centenas de acessos, isso é inviável. Falta "Manter Todos", "Revogar Todos" e seleção com checkbox.

**5. Revisão concluída pode ser editada novamente**
Não há proteção contra re-submissão. O owner pode salvar múltiplas vezes gerando ações duplicadas na `iam_queue`.

**6. Página de detalhe (admin) permite decisão individual sem gerar iam_queue**
O `handleDecisao` na `RevisaoDetalhePage` muda a decisão do item mas NÃO gera ações de revogação no Entra ID. Decisão tomada pelo admin fica puramente documental.

**7. Falta data limite na criação da campanha**
O formulário de "Nova Campanha" não permite definir uma data limite. O campo `data_fim` nunca é preenchido.

**8. Falta busca/filtro na listagem e no detalhe**
Sem campo de busca para filtrar por nome da aplicação ou responsável.

**9. Falta contadores no header da listagem**
Não há cards resumo (Total, Em andamento, Concluídas).

**10. Página externa sem branding**
A página pública é genérica, sem logo ou identificação visual da empresa.

### Melhorias propostas

#### A. Integrar envio real de e-mail
- Usar Lovable AI (modelo GPT) para gerar o HTML do e-mail
- Usar o Resend connector (ou verificar se existe) para envio real
- Fallback: usar `supabase.auth.admin` para enviar magic link customizado
- Guardar a URL correta do app (`https://origo-identity.lovable.app`) como parâmetro ou variável de ambiente

#### B. Adicionar `remove_app` nas revogações
- Na `RevisaoExternaPage`, ao revogar, buscar `perfil_aplicacoes` do perfil e gerar `remove_app` na `iam_queue` (igual já faz para grupos e licenças)

#### C. Ações em massa na página externa
- Adicionar botões "Manter Todos" e "Revogar Todos" no header da tabela
- Adicionar checkboxes para seleção parcial com botões "Manter Selecionados" / "Revogar Selecionados"
- Adicionar busca por nome de pessoa

#### D. Proteger contra re-submissão
- Após salvar, marcar a revisão como `concluida` e desabilitar os botões de decisão
- Mostrar mensagem "Esta revisão já foi concluída em DD/MM/AAAA" se o status for `concluida`

#### E. Alinhar detalhe admin com provisionamento
- O `handleDecisao` na `RevisaoDetalhePage` deve gerar as mesmas ações de `iam_queue` que a página externa (usando a mesma lógica de revogação)
- Ou: remover os botões de decisão do detalhe admin (tornar read-only) e deixar a decisão apenas para a página externa

#### F. Adicionar data limite e busca na criação/listagem
- Campo "Data Limite" no dialog de nova campanha
- Contadores no header (Total, Em andamento, Concluídas)
- Campo de busca na listagem

#### G. Melhorar página externa
- Adicionar logo e branding
- Mostrar nome da aplicação, data limite, e instruções claras
- Adicionar confirmação antes de salvar ("Tem certeza? X acessos serão revogados")
- Mostrar resumo após salvar (quantos mantidos, quantos revogados)

### Arquivos a alterar

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/revisoes/RevisaoExternaPage.tsx` — massa, remove_app, proteção, branding, confirmação |
| Editar | `src/pages/revisoes/RevisoesPage.tsx` — data limite, contadores, busca |
| Editar | `src/pages/revisoes/RevisaoDetalhePage.tsx` — tornar read-only ou alinhar com iam_queue |
| Editar | `supabase/functions/send-review-email/index.ts` — URL correta, preparar para envio real |

### Ordem de implementação

1. Corrigir revogação (adicionar `remove_app`) e proteger contra re-submissão
2. Adicionar ações em massa e busca na página externa
3. Melhorar listagem (contadores, busca, data limite)
4. Alinhar detalhe admin (read-only ou com provisionamento)
5. Melhorar branding e UX da página externa
6. Corrigir Edge Function de e-mail (URL correta)

