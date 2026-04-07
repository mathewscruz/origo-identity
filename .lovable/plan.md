

## Analise IAM/IGA — Lacunas, Melhorias e Inconsistencias

### O que ja existe e funciona

- Ciclo JML (Joiner/Mover/Leaver) com eventos e provisionamento
- Perfis de Acesso com composicao (apps, grupos, licencas)
- Motor de Regras (cargo → perfil)
- Fila de Provisionamento (iam_queue) com integracao Entra ID
- Revisoes de Acesso com pagina externa para owners
- Excecoes de acesso com aprovacao
- Importacao CSV e sync Azure
- Auditoria e Alertas

---

### PROBLEMAS E INCONSISTENCIAS CRITICAS

**1. Dashboard com dados ficticios (hardcoded)**
O grafico "Acessos por Status" (Ativos: 842, Pendentes: 56, etc.) e o grafico "Eventos JML — Ultimas 8 Semanas" usam arrays estaticas. Nao refletem dados reais do banco.

**2. Matriz Cargo x Acesso totalmente hardcoded**
A pagina `MatrizPage.tsx` tem cargos, perfis e mapeamentos todos em constantes no codigo. Deveria ser gerada dinamicamente a partir das tabelas `cargos`, `perfis_acesso`, `cargo_perfis` e `regras`.

**3. Terceiros sem integracao de provisionamento**
Terceiros tem campo `sam_account_name` mas nao ha fluxo JML nem provisionamento automatico para eles. Nao geram eventos JML ao vencer contrato.

---

### FUNCIONALIDADES QUE FALTAM (padrao IGA/IAM)

**4. Self-Service / Portal do Colaborador**
Funcionalidade essencial em IGA. O proprio usuario deveria poder:
- Solicitar acesso a um perfil/aplicacao
- Ver seus acessos atuais
- Acompanhar status das solicitacoes

**5. Workflow de Aprovacao multi-nivel**
Hoje excecoes tem aprovacao simples. Falta um workflow configuravel:
- Gestor direto → Owner do sistema → TI
- Escalacao automatica por timeout
- Delegacao de aprovacao

**6. Segregation of Duties (SoD) / Conflitos de Acesso**
Nao existe validacao de conflitos. Exemplo: um usuario nao deveria ter acesso a "Contas a Pagar" e "Aprovacao de Pagamentos" simultaneamente. Falta:
- Tabela de regras SoD (perfil A conflita com perfil B)
- Validacao automatica ao atribuir perfis
- Alertas de violacao

**7. Certificacao / Recertificacao periodica automatica**
As revisoes existem mas nao ha agendamento automatico (cron). Deveria:
- Criar campanhas de revisao automaticamente (ex: a cada 90 dias)
- Notificar owners com prazo
- Escalar se nao responder

**8. Relatorios e Compliance**
Nao existe modulo de relatorios. Para IGA e essencial:
- Quem tem acesso a que (snapshot)
- Historico de acessos concedidos/revogados
- Relatorio de contas orfas (sem dono)
- Relatorio de acessos excessivos
- Exportacao para auditores

**9. Contas Orfas / Orphan Accounts**
Nao ha deteccao de contas no Entra ID que nao estao vinculadas a nenhum colaborador ativo no sistema.

**10. Gestao de Senhas**
Nao ha integracao para reset de senha, politicas de senha ou notificacao de senha expirada.

---

### MELHORIAS DE UX/UI

**11. Dashboard com dados reais**
Substituir todos os dados hardcoded por queries reais: contagem de perfil_atribuicoes por status, eventos JML agrupados por semana, etc.

**12. Matriz dinamica**
Gerar a matriz Cargo x Perfil automaticamente a partir de `cargo_perfis` e `regra_condicoes`/`regra_resultados`.

**13. Notificacoes in-app**
O icone de sino no sidebar poderia mostrar um badge com contagem de alertas nao lidos e um dropdown com os ultimos alertas.

**14. Expiração automatica de terceiros**
Ao vencer o contrato, gerar evento JML tipo "leaver" automaticamente e desabilitar acessos.

---

### RECOMENDACAO DE PRIORIDADE

| Prioridade | Item | Impacto |
|---|---|---|
| 1 | Dashboard com dados reais | Credibilidade — dados ficticios desqualificam o sistema |
| 2 | Matriz dinamica | Mesmo motivo — dados hardcoded |
| 3 | SoD / Conflitos de Acesso | Compliance critico em IGA |
| 4 | Relatorios e Compliance | Exigido por auditores |
| 5 | Contas Orfas | Seguranca — detectar shadow IT |
| 6 | Self-Service | Reduz carga operacional |
| 7 | Workflow multi-nivel | Maturidade do processo |
| 8 | Recertificacao automatica | Automacao de revisoes |
| 9 | Expiracao de terceiros | Seguranca |
| 10 | Notificacoes in-app | UX |

Posso comecar implementando qualquer um desses itens. Recomendo iniciar pelos itens 1 e 2 (Dashboard e Matriz com dados reais) pois sao correcoes de inconsistencia, seguidos do item 3 (SoD) que e o diferencial mais importante para uma ferramenta IGA.

