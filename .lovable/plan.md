

# Órigo Identity — Especificação Funcional Consolidada

---

## 1. Visão Geral do Produto

**Objetivo**: Sistema corporativo de governança de identidades e acessos baseado em cargos, com automação do ciclo de vida JML (Joiner, Mover, Leaver), gestão diferenciada de terceiros e integração futura com Microsoft Entra ID.

**Contexto**: A base de pessoas é importada do sistema 2Easy (RH). O Órigo não é o sistema de origem dos dados de pessoas — ele consome, governa e executa ações de acesso com base nas mudanças detectadas.

**Princípios**:
- Automação primeiro, aprovação manual apenas para exceções
- Separação clara entre pessoa governada e operador do sistema
- Terceiros como cidadãos de primeira classe com ciclo de vida próprio
- Rastreabilidade completa de todas as ações
- Quarentena antes de ações destrutivas por ausência na importação

**Escopo funcional**: 14 módulos — Dashboard, Colaboradores, Terceiros, Eventos JML, Aplicações, Perfis de Acesso, Exceções, Revisões, Motor de Regras, Matriz Cargo×Acesso, Licenças, Auditoria, Alertas, Configurações.

---

## 2. Perfis do Sistema

| Perfil | Descrição |
|---|---|
| **Super Admin** | Acesso total, configurações globais, gestão de operadores |
| **Administrador IAM** | Regras, perfis, eventos JML, exceções, revisões, licenças |
| **Dono de Aplicação** | Gerencia suas apps, aprova exceções/revisões das suas apps |
| **Auditor** | Read-only total + exportação de relatórios |
| **Leitura** | Dashboard + consultas básicas sem ações |

**Tabela de permissões**:

| Módulo | Super Admin | Admin IAM | Dono App | Auditor | Leitura |
|---|---|---|---|---|---|
| Dashboard | Total | Total | Filtrado | Total | Total |
| Colaboradores | CRUD | CRUD | Leitura dos seus | Leitura | Leitura |
| Terceiros | CRUD | CRUD | Leitura dos vinculados | Leitura | Leitura |
| Eventos JML | Processar/Cancelar | Processar/Cancelar | Aprovar dos seus | Leitura | Leitura |
| Aplicações | CRUD | CRUD | Edita as suas | Leitura | Leitura |
| Perfis de Acesso | CRUD | CRUD | Leitura | Leitura | Leitura |
| Exceções | CRUD + Aprovar | CRUD + Aprovar | Aprovar dos seus | Leitura | Leitura |
| Revisões | CRUD | CRUD | Decidir dos seus | Leitura | Leitura |
| Motor de Regras | CRUD | CRUD | Leitura | Leitura | Leitura |
| Matriz | Leitura | Leitura | Leitura | Leitura | Leitura |
| Licenças | CRUD | CRUD | Ver dos seus | Leitura | Leitura |
| Auditoria | Total | Total | Leitura | Leitura | Leitura limitada |
| Alertas | Todos | Todos | Dos seus | Todos | Dos seus |
| Configurações | Total | Parcial | — | — | — |
| Operadores | CRUD | — | — | — | — |

---

## 3. Arquitetura Funcional

### Módulos

| # | Módulo | Responsabilidade |
|---|---|---|
| 1 | Dashboard | KPIs, alertas, eventos recentes, importações, gráficos de tendência |
| 2 | Colaboradores | Gestão de funcionários internos (fonte 2Easy) |
| 3 | Terceiros | Ciclo de vida próprio: contrato, renovação, revisão, vencimento |
| 4 | Eventos JML | Fila de processamento: Detectado → Calculado → Executado → Auditado |
| 5 | Aplicações | Catálogo corporativo com owner, criticidade, grupos Entra ID |
| 6 | Perfis de Acesso | Conjuntos nomeados de acessos (apps + grupos + licenças) |
| 7 | Exceções de Acesso | Concessões fora da regra com justificativa, aprovador e validade |
| 8 | Revisões de Acesso | Campanhas periódicas de recertificação |
| 9 | Motor de Regras | Regras multi-critério com prioridade, conflito e simulação |
| 10 | Matriz Cargo×Acesso | Visualização consolidada derivada do motor (read-only) |
| 11 | Licenças | Inventário, atribuição, revogação, fila de pendências |
| 12 | Auditoria | Logs completos, evidências, relatórios exportáveis |
| 13 | Alertas | Central de notificações operacionais |
| 14 | Configurações | Cargos, áreas, empresas, localidades, operadores, parâmetros |

### Pessoa Governada vs. Operador

- `pessoas` = quem é governado (funcionário, terceiro) — nunca faz login no Órigo
- `operadores` = quem usa o Órigo (admin, auditor, owner) — vinculado a `auth.users`
- Um operador pode ser também pessoa governada via `pessoa_id` (nullable)
- Owner de aplicação é operador com perfil `dono_app`, referenciado via `aplicacoes.owner_id`

---

## 4. Modelo de Dados Funcional

### Configuração Base
```
empresas (id, nome, cnpj, tipo:[matriz/filial/terceira], ativo)
localidades (id, nome, cidade, estado, pais, ativo)
areas (id, nome, empresa_id→empresas, ativo)
cargos (id, nome, area_id→areas, ativo)
```

### Identidade
```
pessoas
├── id, nome, email, cpf(unique), cargo_id, area_id, empresa_id
├── localidade_id, gestor_id→pessoas, tipo_vinculo:[clt/estagiario/terceiro/temporario]
├── status:[ativo/inativo/afastado/desligado], data_admissao, data_desligamento
├── entra_id_object_id, origem_importacao_id→importacoes
├── created_at, updated_at

terceiros_detalhes (1:1 com pessoas)
├── pessoa_id→pessoas(unique), empresa_contratada_id→empresas
├── gestor_responsavel_id→pessoas, data_inicio_contrato, data_fim_contrato
├── criticidade:[baixa/media/alta/critica], renovacao_obrigatoria:boolean
├── data_ultima_renovacao, data_proxima_revisao
├── status_contrato:[ativo/vencido/renovado/encerrado], observacoes
```

### Operadores
```
operadores
├── id, user_id→auth.users, nome, email
├── perfil_sistema:[super_admin/admin_iam/dono_app/auditor/leitura]
├── pessoa_id→pessoas(nullable), ativo, created_at
```

### Aplicações e Perfis
```
aplicacoes
├── id, nome, descricao, tipo_autenticacao:[sso_entra/saml/local/api_key]
├── criticidade:[baixa/media/alta/critica], owner_id→operadores
├── owner_substituto_id→operadores, entra_id_app_id
├── integracao_ativa:boolean, requer_aprovacao_owner:boolean
├── requer_revisao_periodica:boolean, intervalo_revisao_dias
├── url, ativo

perfis_acesso
├── id, nome, descricao, tipo:[padrao/temporario]
├── sensibilidade:[normal/sensivel/privilegiado]
├── requer_aprovacao_extra:boolean, requer_justificativa:boolean
├── validade_dias, ativo

perfil_aplicacao (N:N)
├── perfil_id→perfis_acesso, aplicacao_id→aplicacoes
├── grupo_entra_id, licenca_tipo_id→licenca_tipos, licenca_obrigatoria:boolean
```

### Motor de Regras
```
regras_atribuicao
├── id, nome, descricao, prioridade:integer, ativo:boolean
├── data_inicio_vigencia, data_fim_vigencia, modo_execucao:[automatico/aprovacao_manual]
├── created_by, updated_at

regra_condicoes (1:N, combinação AND)
├── regra_id, campo:[cargo/area/tipo_vinculo/empresa/empresa_contratada/localidade/gestor/status]
├── operador:[igual/diferente/em_lista/nao_em_lista], valor:text

regra_resultados (1:N)
├── regra_id, tipo_resultado:[conceder_perfil/revogar_perfil/atribuir_licenca/remover_licenca/exigir_aprovacao/gerar_alerta/bloquear_concessao]
├── perfil_id, licenca_tipo_id, aprovador_tipo:[gestor/owner_app/admin_iam]
├── alerta_mensagem, motivo_bloqueio

regra_conflitos (N:N)
├── regra_id_a, regra_id_b, tipo:[mutuamente_exclusivo/prioridade_resolve]
```

### Importação e Diff
```
importacoes
├── id, data_importacao, arquivo_nome, arquivo_hash
├── total_registros, novos, alterados, desligados, ignorados
├── status:[recebida/processando/concluida/erro], erro_detalhes, processado_por

snapshots_pessoa
├── id, importacao_id→importacoes, cpf, dados_raw:jsonb
├── hash_comparacao:text(SHA-256), pessoa_id→pessoas(nullable)
├── status_match:[novo/existente_alterado/existente_igual/desligado/quarentena]
├── campos_alterados:jsonb

historico_pessoa
├── id, pessoa_id→pessoas, importacao_id→importacoes, snapshot_id→snapshots_pessoa
├── campo_alterado, valor_anterior, valor_novo
├── tipo_mudanca:[admissao/cargo/area/localidade/empresa/gestor/desligamento/dados_pessoais]
```

### Eventos JML
```
eventos_jml
├── id, pessoa_id→pessoas, tipo:[joiner/mover/leaver]
├── importacao_id→importacoes, dados_anteriores:jsonb, dados_novos:jsonb
├── status:[detectado/calculado/executando/executado/executado_parcial/aguardando_aprovacao/erro/erro_permanente/cancelado/quarentena]
├── requer_aprovacao:boolean, motivo_aprovacao, aprovado_por→operadores
├── tentativas:integer, max_tentativas:integer(default 3), ultimo_erro, proximo_retry
├── data_deteccao, data_calculo, data_execucao

acoes_evento
├── id, evento_id→eventos_jml
├── tipo_acao:[conceder_perfil/revogar_perfil/conceder_licenca/revogar_licenca/adicionar_grupo/remover_grupo]
├── aplicacao_id, perfil_id, licenca_tipo_id, regra_origem_id→regras_atribuicao
├── status:[pendente/executando/executado/erro/pendente_licenca/pulado]
├── idempotency_key, tentativas, ultimo_erro
├── inicio_execucao, fim_execucao, evidencia:jsonb
```

### Exceções, Revisões, Aprovações
```
excecoes_acesso
├── id, pessoa_id→pessoas, aplicacao_id→aplicacoes, perfil_id→perfis_acesso
├── tipo:[concessao_extra/remocao/elevacao_temporaria]
├── justificativa, solicitado_por→operadores, status:[pendente/aprovada/rejeitada/expirada/revogada]
├── data_inicio, data_fim, created_at

campanhas_revisao
├── id, nome, descricao, tipo:[por_aplicacao/por_owner/por_populacao/terceiros]
├── escopo_filtro:jsonb, data_inicio, data_limite
├── status:[planejada/em_andamento/concluida/cancelada], criada_por→operadores

itens_revisao
├── id, campanha_id→campanhas_revisao, pessoa_id→pessoas, aplicacao_id→aplicacoes
├── acesso_atual, decisao:[manter/revogar/pendente]
├── decidido_por→operadores, justificativa, data_decisao

aprovacoes
├── id, entidade_tipo:[excecao/evento_jml], entidade_id
├── aprovador_id→operadores, ordem_cadeia:integer
├── status:[pendente/aprovado/rejeitado/escalado], data_decisao, justificativa
```

### Licenças
```
licenca_tipos
├── id, nome, descricao, aplicacao_id→aplicacoes, sku_entra_id
├── total_disponivel, em_uso, custo_unitario
├── modo_atribuicao:[automatico/manual/sob_demanda]
├── revogacao_automatica:boolean, requer_integracao:boolean

licenca_atribuicoes
├── id, licenca_tipo_id→licenca_tipos, pessoa_id→pessoas
├── data_atribuicao, data_revogacao, status:[ativa/revogada/expirada]
├── origem:[regra/excecao/manual]

fila_pendencias_licenca
├── id, pessoa_id, licenca_tipo_id, acao_evento_id→acoes_evento
├── data_criacao, status:[pendente/resolvida/cancelada]
├── resolvida_por→operadores, data_resolucao
```

### Auditoria e Alertas
```
auditoria
├── id, timestamp, operador_id→operadores
├── acao, entidade, entidade_id, detalhes:jsonb, ip_address

alertas
├── id, tipo, destinatario_id→operadores, titulo, mensagem
├── entidade_ref_tipo, entidade_ref_id, lido:boolean, created_at
```

---

## 5. Regras de Negócio

### Importação e Diff 2Easy
- Arquivo importado gera `importacao` + `snapshots_pessoa` com hash SHA-256 dos campos governados
- CPF é chave natural de match
- Diff campo a campo gera `historico_pessoa` por mudança
- Classificação: novo=JOINER, cargo/area/localidade mudou=MOVER, data_desligamento preenchida=LEAVER
- **Ausência na importação = QUARENTENA** (não leaver automático) — requer validação manual

### Eventos JML
- Fluxo padrão: Detectado → Calculado → Executado → Auditado
- Aprovação manual apenas para apps críticas, perfis sensíveis ou conflitos
- Eventos podem ser cancelados ou descartados com justificativa obrigatória
- Severidade derivada das apps/perfis envolvidos

### Motor de Regras
- Condições multi-critério (AND): cargo, área, tipo vínculo, empresa, localidade, gestor, status
- Resultados: conceder/revogar perfil, atribuir/remover licença, exigir aprovação, gerar alerta, bloquear concessão
- Prioridade numérica resolve conflitos; `mutuamente_exclusivo` bloqueia e exige aprovação
- Simulação de impacto antes de ativar (read-only, sem side effects)

### Sensibilidade de Acesso
- `aplicacao.criticidade` + `perfil.sensibilidade` determinam nível de controle
- App crítica + perfil privilegiado → aprovação owner + admin IAM
- Perfil sensível → revisão periódica obrigatória
- `requer_aprovacao_extra` → nunca execução automática

### Cadeia de Aprovação (Terceiros)
| Cenário | Aprovador 1 | Aprovador 2 | Aprovador 3 |
|---|---|---|---|
| App não crítica | Gestor responsável | — | — |
| App crítica | Gestor responsável | Owner da app | — |
| Privilegiado em app crítica | Gestor responsável | Owner da app | Admin IAM |
| Renovação contrato | Gestor responsável | — | — |
| Exceção de acesso | Gestor responsável | Owner da app | Admin IAM |

Para internos: owner da app para apps críticas, admin IAM para privilegiados. Cadeia sequencial — rejeição para o fluxo. Timeout gera escalação.

### Licenças — Indisponibilidade
- Se sem disponibilidade: ação=`pendente_licenca`, evento=`executado_parcial`
- Gera alerta para Admin IAM + Owner, cria registro em `fila_pendencias_licenca`
- Demais ações continuam (falha isolada)
- Quando licença liberada → reprocessa fila

### Idempotência e Reprocessamento
- `idempotency_key` = hash de (evento_id, tipo_acao, aplicacao_id, perfil_id)
- Antes de executar, verifica existência com status=executado → pula
- Falha parcial: cada `acao_evento` tem status independente
- Retry com backoff exponencial até `max_tentativas`
- Após max → `erro_permanente` + alerta Admin IAM
- Reprocessamento manual executa apenas pendentes/erro

---

## 6. Fluxos Operacionais

### Fluxo de Importação
```
Arquivo 2Easy → importacao(status=recebida) → parse → snapshots com hash
→ diff contra pessoas ativas → historico_pessoa por campo
→ classifica: JOINER / MOVER / LEAVER / QUARENTENA (ausentes)
→ importacao.status=concluida
→ Registros em quarentena exibidos para validação manual
```

### Fluxo JML
```
Evento detectado → Motor avalia regras (condições + prioridade + conflitos)
→ Gera acoes_evento → Verifica sensibilidade
→ Automático: executa com idempotency check
   → Licença indisponível: pendente_licenca, evento=executado_parcial
   → Falha técnica: retry backoff até max
   → Tudo ok: evento=executado
→ Manual: aguardando_aprovacao → cadeia sequencial
→ Auditoria em cada passo
```

### Fluxo de Aprovação
```
Ação requer aprovação → cria registros em aprovacoes (ordem 1,2,3)
→ Notifica aprovador 1 → Aprova: passa para aprovador 2 → ...
→ Rejeição em qualquer ponto: fluxo encerrado
→ Timeout: escalação ou alerta
→ Todos aprovados: executa ações
```

### Fluxo de Terceiros
```
Cron diário verifica data_fim_contrato
→ D-30/15/7: gera alertas para gestor + owners das apps
→ D-0 sem renovação: evento Leaver automático
→ Renovação: modal com nova data, justificativa, mantém acessos
→ Revisão periódica conforme configuração
```

### Fluxo de Erro/Retry
```
Falha isolada por ação (não bloqueia outras)
→ tentativas++ → backoff exponencial → proximo_retry
→ Se max atingido → erro_permanente + alerta Admin IAM
→ Reprocessamento manual: reexecuta apenas pendentes/erro
→ Ações já executadas ignoradas (idempotência)
```

---

## 7. Especificação de Telas

### Layout Global
- **Sidebar fixa** (collapsible) com logo Órigo, grupos: Operação, Identidades, Governança, Controle, Auditoria, Sistema
- **Header**: SidebarTrigger + breadcrumb + badge alertas não lidos + avatar operador (dropdown perfil/sair)
- **Content**: max-w-7xl, padding consistente
- **Tema**: fundo #fafafa, cards brancos, Inter, accent azul corporativo
- Sidebar mostra apenas módulos permitidos ao perfil

### 7.1 Dashboard (`/`)

**Objetivo**: Visão operacional consolidada.

**KPI Cards (4)**: Pessoas ativas (+X novos mês) | Terceiros vencendo 30d (badge vermelho se >0) | Eventos JML pendentes (badge por tipo) | Última importação (status badge)

**Gráficos**: Bar chart eventos JML por semana (8 semanas, stacked J/M/L) | Donut acessos por status

**Tabelas resumo**: Últimos 10 eventos JML (tipo badge, pessoa, cargo, status badge, data → link detalhe) | Últimos 10 alertas não tratados | Últimas 5 importações

**Permissões**: Todos os perfis (conteúdo filtrado).

### 7.2 Colaboradores (`/colaboradores`, `/colaboradores/:id`)

**Objetivo**: Gestão de funcionários internos.

**Lista** — Filtros: busca nome/email/CPF, status (multi-select), cargo, área, empresa, localidade. Tabela: Nome (link), Email, CPF mascarado, Cargo, Área, Status (badge cores), Última importação, Acessos ativos (count). Ação: "Importar base" (modal). Paginação 25/50/100.

**Detalhe** — Header com nome, cargo, área, status badge. Tabs: Dados pessoais (card read-only, botão editar modal) | Acessos ativos (tabela app/perfil/origem badge/status, ação revogar) | Histórico JML (timeline) | Histórico importação (tabela campo/antes/depois).

**Modal Importação** — Upload drag&drop CSV/Excel, preview 10 linhas. "Validar" → resumo (novos, alterados, desligados, **ausentes em quarentena**). Card alerta: "X registros ausentes — NÃO serão tratados como desligamento até validação manual." Confirmar/Cancelar.

**Estado vazio**: "Nenhum colaborador encontrado. Importe a base 2Easy para começar."

### 7.3 Terceiros (`/terceiros`, `/terceiros/:id`)

**Objetivo**: Ciclo de vida de terceiros com controle de contrato.

**Lista** — Filtros: busca, status contrato, empresa contratada, criticidade, gestor, vencimento (7/15/30d). Tabela: Nome (link), Empresa contratada, Gestor, Cargo, Criticidade (badge), Fim contrato (vermelho <7d, laranja <30d), Status contrato (badge), Acessos (count). Card alerta topo: "X terceiros vencendo em 7 dias." Ação: "Novo terceiro" (drawer).

**Detalhe** — Header com barra progresso visual contrato (início→hoje→fim). Tabs: Dados contrato (campos + "Editar" + "Renovar contrato" modal) | Dados pessoais | Acessos (+ coluna "Aprovado por" com cadeia) | Histórico JML | Revisões.

**Drawer Novo Terceiro** — Nome, email, CPF, cargo, área, empresa contratada (select), gestor responsável (select busca), datas, criticidade, renovação obrigatória (switch), observações.

**Modal Renovar** — Nova data fim, justificativa, manter acessos (switch).

### 7.4 Eventos JML (`/eventos-jml`, `/eventos-jml/:id`)

**Objetivo**: Central de processamento e monitoramento JML.

**Fila** — Tabs: Pendentes | Em processamento | Quarentena | Executados | Erros | Todos. Filtros: tipo (J/M/L), status, período, pessoa, criticidade. Tabela: Tipo (badge J=verde/M=azul/L=vermelho), Severidade (badge derivada), Pessoa (link), Mudança detectada (resumo), Ações propostas (count), Status (badge), Importação (link), Data. Ações por linha: Ver detalhe, Aprovar, Cancelar (modal justificativa), Reprocessar, Descartar falso positivo (modal justificativa obrigatória). Card alerta: "X eventos em quarentena aguardam validação."

**Detalhe** — Header: tipo badge, pessoa, status, severidade, timestamps. Seção "Mudanças": card comparativo Antes|Depois (campos alterados em amarelo). Seção "Ações": tabela tipo_ação badge, app, perfil, regra origem (link), status badge, tentativas, evidência (modal JSON). Seção "Aprovação": timeline horizontal. Seção "Quarentena": card explicativo + "Confirmar como Leaver" ou "Descartar — pessoa ativa". Ações header: Aprovar, Cancelar, Reprocessar, Descartar.

### 7.5 Aplicações (`/aplicacoes`, `/aplicacoes/:id`)

**Objetivo**: Catálogo corporativo com governança de owner.

**Lista** — Filtros: busca, criticidade, tipo auth, owner, integração, status. Tabela: Nome (link), Criticidade (badge), Tipo auth (badge), Owner, Perfis vinculados (count), Licenças ativas (count), Requer aprovação (ícone), Integração (badge). Ação: "Nova aplicação" (drawer).

**Detalhe** — Tabs: Dados gerais | Perfis vinculados (tabela perfil/sensibilidade/grupo/licença) | Pessoas com acesso (tabela pessoa/perfil/origem/data/status) | Licenças (tabela tipo/total/em uso/disponível + barra progresso) | Regras associadas.

**Drawer Nova/Editar** — Nome, descrição, tipo auth, criticidade, owner (select operadores), owner substituto, URL, Entra ID App ID, integração ativa, requer aprovação owner, requer revisão periódica, intervalo dias.

### 7.6 Perfis de Acesso (`/perfis-acesso`, `/perfis-acesso/:id`)

**Lista** — Filtros: busca, sensibilidade, tipo, status. Tabela: Nome (link), Sensibilidade (badge cinza/laranja/vermelho), Tipo (badge), Apps incluídas (count), Pessoas (count), Requer aprovação extra (ícone), Validade. Ação: "Novo perfil" (drawer).

**Detalhe** — Tabs: Composição (tabela perfil_aplicacao editável: app, grupo, licença, obrigatória) | Pessoas atribuídas | Regras que concedem.

**Drawer** — Nome, descrição, tipo, sensibilidade, validade dias, requer aprovação extra, requer justificativa. Seção apps: tabela editável.

### 7.7 Exceções de Acesso (`/excecoes`, `/excecoes/:id`)

**Lista** — Tabs: Pendentes | Aprovadas | Rejeitadas | Expiradas | Todas. Filtros: pessoa, app, tipo, solicitante, período. Tabela: Pessoa (link), App, Tipo (badge), Justificativa (truncado), Solicitado por, Status (badge), Validade, Aprovações (progress ex: 1/2). Ação: "Nova exceção" (drawer). Ações linha: Aprovar, Rejeitar (justificativa), Revogar, Ver detalhe.

**Drawer Nova** — Pessoa (select busca), app, perfil (filtrado pela app), tipo exceção, justificativa (textarea obrigatória), data início, data fim, anexos.

**Detalhe** — Header + cadeia aprovação (timeline horizontal) + histórico.

### 7.8 Revisões de Acesso (`/revisoes`, `/revisoes/:id`)

**Lista** — Filtros: status, tipo, período. Tabela: Nome (link), Tipo (badge), Status (badge), Progresso (barra X/Y), Data limite (vermelho se próximo), Criada por. Ação: "Nova campanha" (drawer).

**Detalhe** — Header + progresso total. Tabela itens: Pessoa (link), App, Acesso atual, Decisão (badge manter=verde/revogar=vermelho/pendente=cinza), Decidido por, Data. Ações lote: Manter/Revogar selecionados. Ações linha: Manter, Revogar (justificativa).

**Drawer Nova** — Nome, descrição, tipo, datas, filtro escopo (por app/área/vínculo/criticidade), preview count itens.

### 7.9 Motor de Regras (`/regras`, `/regras/nova`, `/regras/:id/editar`)

**Lista** — Filtros: busca, status, modo, prioridade. Tabela: Nome (link), Prioridade (badge), Condições (resumo), Resultados (resumo), Modo (badge auto=verde/aprovação=amarelo), Vigência, Status (badge), Conflitos (count vermelho). Ação: "Nova regra" (página). Ações linha: Editar, Simular, Duplicar, Desativar.

**Editor (página dedicada)** — Seção 1: dados gerais (nome, descrição, prioridade, modo, vigência). Seção 2: Condições (builder visual AND — campo select → operador select → valor select dinâmico, + adicionar). Seção 3: Resultados (tipo select → campos condicionais, + adicionar). Seção 4: Conflitos (read-only automático). Seção 5: Simulação ("Simular" → card: total impactados, tabela pessoa/ação/perfil, conflitos, licenças consumidas vs disponíveis). Ações: Salvar rascunho, Ativar, Cancelar.

### 7.10 Matriz Cargo×Acesso (`/matriz`)

**Objetivo**: Visualização consolidada read-only.

Filtros: tipo vínculo, área, empresa. Tabela pivotada: linhas=cargos, colunas=perfis. Células: ●=automático, ○=sob aprovação, vazio. Hover: tooltip regra origem. Clique: navega para regra. Toggle: "Por perfil" / "Por aplicação". Exportar CSV/Excel.

### 7.11 Licenças (`/licencas`, `/licencas/:id`)

**Lista** — Filtros: app, modo, disponibilidade. Tabela: Tipo (link), App, Total, Em uso, Disponível (barra, vermelho <10%), Modo (badge), Revogação auto (ícone). Card alerta: "X tipos com disponibilidade crítica." Ação: "Novo tipo" (drawer).

**Detalhe** — Header + barra uso grande. Tabs: Atribuições ativas | Fila pendências (tabela pessoa/data/evento/status, ações: resolver/cancelar) | Histórico.

**Drawer** — Nome, descrição, app, SKU Entra ID, total, custo unitário, modo atribuição, revogação automática, requer integração.

### 7.12 Auditoria (`/auditoria`)

Filtros expandable: período (obrigatório), operador, ação, entidade, entidade ID, IP. Tabela: Timestamp, Operador, Ação, Entidade (badge), Entidade ID (link), Resumo (truncado), IP. Ação linha: "Ver detalhes" (modal JSON). Ações: Exportar CSV/Excel, Exportar relatório compliance PDF. Paginação 50/100/200.

### 7.13 Alertas (`/alertas`)

Tabs: Não lidos | Todos. Filtros: tipo, severidade, período. Tabela: Severidade (badge), Título, Mensagem (truncado), Referência (link contextual), Data, Lido (ícone). Ações: Marcar como lido, Ir para referência. Lote: Marcar todos lidos. Badge sidebar: count não lidos, vermelho se críticos.

### 7.14 Configurações (`/configuracoes/*`)

Sub-navegação vertical:

- **Cargos** (`/configuracoes/cargos`): Tabela CRUD nome/área/ativo. Drawer criar/editar. Não excluir em uso.
- **Áreas** (`/configuracoes/areas`): Tabela CRUD nome/empresa/ativo. Drawer.
- **Empresas** (`/configuracoes/empresas`): Tabela CRUD nome/CNPJ/tipo/ativo. Drawer.
- **Localidades** (`/configuracoes/localidades`): Tabela CRUD nome/cidade/estado/país/ativo. Drawer.
- **Operadores** (`/configuracoes/operadores`): Tabela nome/email/perfil(badge)/pessoa vinculada/ativo. Drawer criar/editar.
- **Parâmetros** (`/configuracoes/parametros`): Form cards — dias alerta terceiro (7/15/30), max tentativas retry JML (3), modo quarentena ausência (switch, default ativo), dias retenção auditoria. Botão salvar.

---

## 8. Rotas Completas

```
/                          → Dashboard
/colaboradores             → Lista
/colaboradores/:id         → Detalhe
/terceiros                 → Lista
/terceiros/:id             → Detalhe
/eventos-jml               → Fila
/eventos-jml/:id           → Detalhe
/aplicacoes                → Catálogo
/aplicacoes/:id            → Detalhe
/perfis-acesso             → Lista
/perfis-acesso/:id         → Detalhe
/excecoes                  → Lista
/excecoes/:id              → Detalhe
/revisoes                  → Lista
/revisoes/:id              → Detalhe
/regras                    → Lista
/regras/nova               → Editor
/regras/:id/editar         → Editor
/matriz                    → Matriz
/licencas                  → Lista
/licencas/:id              → Detalhe
/auditoria                 → Logs
/alertas                   → Central
/configuracoes             → Redireciona /configuracoes/cargos
/configuracoes/cargos
/configuracoes/areas
/configuracoes/empresas
/configuracoes/localidades
/configuracoes/operadores
/configuracoes/parametros
```

---

## 9. Padrões Globais de UX

| Padrão | Implementação |
|---|---|
| Loading | Skeleton em tabelas/cards, spinner em botões |
| Erro API | Toast destructive + retry quando aplicável |
| Sucesso | Toast check verde, auto-dismiss 4s |
| Confirmação destrutiva | AlertDialog com texto explícito da consequência |
| Estado vazio | Ilustração + texto + CTA primário |
| Paginação | Componente padrão + seletor itens/página |
| Breadcrumb | Sempre: Módulo > Sub > Item |
| Responsividade | Desktop-first 1280px+, scroll horizontal em telas menores |
| Permissões UI | Botões ocultos sem permissão; páginas 403 |

---

## 10. Fases de Implementação

| Fase | Escopo |
|---|---|
| **1** | Layout global + sidebar + dashboard (KPIs mockados) + CRUDs configurações + catálogo aplicações + operadores RBAC + rotas com placeholders |
| **2** | Perfis de acesso + motor de regras + simulação + matriz cargo×acesso + sensibilidade |
| **3** | Gestão pessoas + terceiros + importação 2Easy (snapshots/diff/histórico/quarentena) + motor JML + idempotência |
| **4** | Exceções + aprovações cadeia + revisões + licenças + fila pendências + alertas + auditoria |
| **5** | Integração Microsoft Graph API (Entra ID) |

---

## 11. Pontos Críticos

1. **Motor de regras** — Componente mais complexo; edge function com testes extensivos
2. **Diff engine** — Hash SHA-256 dos campos governados; CPF como chave; tratar duplicados
3. **Quarentena** — Ausência na importação NUNCA gera leaver automático sem validação
4. **Cadeia de aprovação** — Lista ordenada; timeout com escalação
5. **Idempotência** — Hash key obrigatório antes de qualquer execução
6. **RLS** — `operadores.perfil_sistema` via `has_role`; owners filtrados por `aplicacoes.owner_id`
7. **Falha parcial** — UI clara sobre quais ações falharam + retry seletivo
8. **Simulação** — Query read-only sem side effects; paginar resultados
9. **Terceiros** — Cron diário verifica vencimento; alertas D-30/15/7; leaver em D-0
10. **Cancelamento de eventos** — Justificativa obrigatória; auditoria registra quem e por quê

