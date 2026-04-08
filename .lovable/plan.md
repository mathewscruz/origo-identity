

## Avaliacao Geral do Sistema — Inconsistencias, Lacunas e Melhorias

### 1. Paginas Placeholder ainda ativas (funcionalidade incompleta)

Duas rotas apontam para `PlaceholderPage` mostrando "Em construcao":
- `/excecoes/:id` — Detalhe da Excecao
- `/licencas/:id` — Detalhe da Licenca

Essas rotas sao acessiveis por links nas listagens, levando o usuario a uma pagina vazia.

**Acao:** Criar paginas de detalhe reais ou remover os links que apontam para elas.

---

### 2. Tabela e arquivos orfaos — Regras (Motor de Regras)

Os arquivos `src/pages/regras/RegrasPage.tsx` e `src/pages/regras/RegraEditorPage.tsx` existem no projeto mas nao tem rotas no `App.tsx`. As tabelas `regras`, `regra_condicoes` e `regra_resultados` existem no banco com 5 registros em `regras`. Esse codigo morto causa confusao.

**Acao:** Excluir os arquivos de Regras e o hook `useRegras` do `useOrigoData.ts`. Opcionalmente, migrar para dropar as tabelas (ou manter para uso futuro).

---

### 3. Tabela `operadores` ainda existe no banco

A pagina e o hook de operadores foram removidos, mas a tabela `operadores` permanece no banco de dados. E uma tabela legada sem uso funcional.

**Acao:** Criar migracao para dropar a tabela `operadores`.

---

### 4. Parametros nao salvam de verdade

Em `ParametrosPage.tsx`, os campos "Max tentativas", "Dupla aprovacao para leavers" e "Importacao automatica" usam `defaultValue` e `defaultChecked`, mas o botao "Salvar Parametros" nao tem `onClick` — nao faz nada. O usuario edita mas nada e persistido.

**Acao:** Implementar o `handleSave` que faz upsert dos parametros no banco, ou remover os campos que nao tem funcionalidade real.

---

### 5. Portal externo e Admin compartilham a mesma sessao de autenticacao

O Portal (`/portal`) e o Admin (`/`) usam o mesmo Supabase Auth. Se um admin ja esta logado e acessa `/portal`, ele ve o portal com sua sessao admin. Se um usuario do portal esta logado e acessa `/`, ele e redirecionado para o admin (onde pode nao ter permissoes). Nao ha separacao de escopo entre os dois.

**Acao:** No `PortalLayout`, nao redirecionar para o admin se o usuario for autenticado. No `ProtectedRoute`, verificar se o usuario tem role admin/operador/viewer — se nao tiver, redirecionar para `/portal`. No portal, nao exigir role especifica.

---

### 6. Ausencia de controle de permissoes por role na UI

O `role` e carregado pelo `AuthContext` (admin/operador/viewer), mas nao e usado para esconder ou desabilitar funcionalidades na interface. Um usuario `viewer` ve todos os botoes de criar, editar, excluir e pode interagir com eles.

**Acao:** Adicionar verificacao de role nos componentes criticos: botoes de criar/editar/excluir devem ser escondidos ou desabilitados para viewers.

---

### 7. Workflow nao esta integrado com Solicitacoes do Portal

O modulo de Workflow permite configurar etapas de aprovacao multi-nivel. A `SolicitacoesPage` (admin) verifica etapas e cria `workflow_execucoes` ao criar solicitacao interna. Porem, solicitacoes criadas pelo Portal externo sao criadas com `status: "pendente"` sem passar pelo workflow.

**Acao:** No `PortalSolicitacoesPage.handleSubmit`, verificar se ha etapas de workflow configuradas e, se sim, setar status como `em_aprovacao` e criar as execucoes correspondentes.

---

### 8. Dados de `iam_queue` — 3881 registros "cancelled" sem limpeza

A tabela `iam_queue` tem 3917 registros, sendo 3881 cancelados. Esses dados ocupam espaco e poluem consultas (o Dashboard carrega todos os registros de status sem filtro de data).

**Acao:** Adicionar filtro de data nas queries do Dashboard (ex: ultimos 90 dias). Considerar uma rotina de archiving para registros antigos.

---

### 9. Dashboard carrega TODOS os registros de `iam_queue` e `perfil_atribuicoes`

As queries `useIamQueueStats` e `useAccessStatusData` fazem `select("status")` sem filtro, carregando potencialmente milhares de linhas para contar no client-side.

**Acao:** Usar queries com `count` do Supabase ou criar views/funcoes no banco para retornar agregados.

---

### 10. Tabela `perfil_composicao` — dados redundantes

A tabela `perfil_composicao` (texto livre para composicao de perfis) existe mas a aba "Composicao" foi removida da UI segundo a memoria. A tabela pode conter dados orfaos.

**Acao:** Verificar se ha dados e, se nao utilizada, dropar.

---

### 11. RLS com `anon SELECT` em tabelas sensiveis

As politicas de RLS mostram que **todas** as tabelas tem `Anon can select` permitindo leitura sem autenticacao. Isso inclui `colaboradores`, `iam_queue`, `auditoria`, `perfil_atribuicoes`, etc. Qualquer pessoa com a URL da API pode ler dados de colaboradores, acessos e filas.

**Acao:** Remover politicas `anon SELECT` de todas as tabelas exceto as estritamente necessarias para fluxos publicos (como `revisao_itens` para a revisao externa).

---

### 12. Pagina EventosJMLPage existe mas a rota redireciona

A rota `/eventos-jml` faz `Navigate to="/fila-provisionamento"`. O arquivo `EventosJMLPage.tsx` ainda existe e usa `useEventosJML`. E codigo morto.

**Acao:** Remover `EventosJMLPage.tsx` e limpar o import/hook associado.

---

### 13. Solicitacoes admin ainda permite selecionar Perfil de Acesso (legado)

O formulario "Nova Solicitacao" em `SolicitacoesPage` ainda permite selecionar um perfil de acesso (campo `perfilId`), embora o portal ja use apps/grupos. Isso cria inconsistencia entre os dois caminhos.

**Acao:** Alinhar o formulario admin com o do portal — substituir perfil por apps/grupos, ou manter ambos como opcao explicita.

---

### 14. Falta de foreign keys no banco

Nenhuma tabela tem foreign keys declaradas. Isso significa que `colaborador_id`, `perfil_id`, `cargo_id`, `area_id`, `empresa_id` etc. nao tem integridade referencial. Dados orfaos podem existir (e provavelmente existem dado que colaboradores foram limpos mas registros filhos podem permanecer).

**Acao:** Avaliar adicao de FKs com `ON DELETE CASCADE` ou `SET NULL` para as relacoes principais.

---

### Prioridades Recomendadas

| Prioridade | Item | Impacto |
|---|---|---|
| Critica | #11 — RLS anon SELECT | Seguranca: dados expostos publicamente |
| Critica | #5 — Separacao portal/admin | Seguranca: usuarios do portal acessam admin |
| Alta | #6 — Controle de role na UI | Seguranca: viewers podem executar acoes |
| Alta | #4 — Parametros nao salvam | Funcionalidade quebrada |
| Alta | #9 — Dashboard performance | Performance com dados crescentes |
| Media | #7 — Workflow + Portal | Integracao incompleta |
| Media | #1 — Placeholders | UX incompleta |
| Media | #8 — Limpeza iam_queue | Performance/manutencao |
| Baixa | #2, #3, #10, #12 — Codigo/tabelas orfaos | Limpeza tecnica |
| Baixa | #13 — Formulario admin | Consistencia |
| Baixa | #14 — Foreign keys | Integridade de dados |

### Proximo Passo

Posso implementar essas correcoes em lotes priorizados. Sugiro comecar pelo lote critico (RLS + separacao portal/admin + controle de roles) e depois seguir com os demais.

