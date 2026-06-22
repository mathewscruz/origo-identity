## Problema

A planilha de RH só marca o colaborador como `inativo` até 5 dias após o desligamento real. Nessa janela, a conta segue ativa em Entra ID/AD com todos os acessos — risco de vazamento, exclusão de dados ou ações em nome da empresa.

Como o CSV é a única fonte e não tem campo antecipado, a mitigação precisa vir de uma ação **manual e imediata** do RH/Segurança, com efeito reversível e sem quebrar o fluxo Leaver formal que virá depois.

## Estratégia: "Pré-Desligamento" (Suspensão Preventiva)

Um novo tipo de evento JML, paralelo ao Leaver, que **bloqueia o acesso agora** sem apagar nada — preservando licenças, grupos e perfis para o Leaver oficial revogá-los quando o CSV confirmar.

### Princípios

- **Aditivo, não destrutivo**: só bloqueia sign-in e revoga sessões; mantém atribuições no banco.
- **Reversível**: se for engano, operador pode reativar com 1 clique enquanto a conta ainda não foi formalmente desligada.
- **Idempotente com o Leaver**: quando o CSV finalmente flipar para `inativo`, o Leaver formal executa normalmente; já encontrando a conta bloqueada, apenas revoga recursos.
- **Auditável**: justificativa obrigatória, evento JML rastreável, alerta no centro de notificações.

### Fluxo proposto

```text
RH detecta desligamento real
        │
        ▼
ColaboradorDetalhePage → botão "Suspender Acessos Imediatamente"
        │ (AlertDialog: justificativa obrigatória + confirmação)
        ▼
createEventoJML(tipo='pre_leaver')
        │
        ├─► iam_queue: disable_entra_account  (accountEnabled=false)
        ├─► iam_queue: revoke_entra_sessions  (revokeSignInSessions)
        ├─► iam_queue: disable_ad_account     (via iam-agent-api)
        ├─► colaboradores.suspenso_preventivo = true (+ data, +operador, +motivo)
        ├─► alertas: severidade='alta', notifica gestor + admins
        └─► auditoria: registro completo

   (5 dias depois)
        ▼
sync-csv-colab vê status: ativo → inativo
        │
        ├─ se suspenso_preventivo=true: cria Leaver, pula etapa de "disable" (já feita),
        │   executa apenas revogação de recursos (licenças, grupos, perfis, apps)
        └─ se false: Leaver completo + alerta "gap detectado: N dias sem suspensão preventiva"
```

### Telas e ações

1. **ColaboradorDetalhePage** (admin/operador): novo botão vermelho "Suspender Acessos" + badge "Suspensão Preventiva ativa desde DD/MM" quando ligado. Botão de reverter ao lado, com mesma confirmação forte.
2. **FilaProvisionamentoPage**: novo filtro/tipo `pre_leaver` distinguido visualmente.
3. **Dashboard**: card "Suspensões preventivas ativas" + métrica "gap médio entre suspensão e Leaver formal".
4. **AlertasPage**: alertas automáticos quando uma suspensão preventiva passa de X dias sem o Leaver formal chegar (sinal de que o RH esqueceu, ou o CSV não atualizou).

### Reversão (engano operacional)

Mesmo botão na tela do colaborador, com AlertDialog: enfileira `enable_entra_account` + `enable_ad_account`, zera `suspenso_preventivo`, registra evento JML `pre_leaver_revertido` e auditoria.

## Detalhes técnicos

### Banco

- `colaboradores`: novas colunas `suspenso_preventivo boolean default false`, `suspenso_em timestamptz`, `suspenso_por text`, `suspenso_motivo text`.
- `eventos_jml.tipo`: aceitar novos valores `pre_leaver` e `pre_leaver_revertido` (atualizar mapeamento em `style/ui-status-formatting`).
- Migração inclui GRANTs e RLS já no padrão admin/operador.

### Edge functions / código

- `src/lib/colaboradorLifecycle.ts`: adicionar `suspendColaboradorPreventivo(id, motivo)` e `revertSuspensaoPreventiva(id)`. Reutilizam `entraQueueHelper` para enfileirar ações com `requested_by='pre_leaver'`.
- `supabase/functions/sync-csv-colab/index.ts`: ao detectar transição ativo→inativo, verificar `suspenso_preventivo`; se true, criar Leaver pulando ações de disable (já em curso/concluídas) e marcar o evento com `gap_dias`.
- `process-iam-queue`: nenhum código novo — as ações `disable_entra_account`, `revoke_entra_sessions`, `disable_ad_account` já existem.
- AuditLogger: novo `acao='suspender_preventivo'` e `'reverter_suspensao'`.

### Segurança e governança

- Botão visível só com `useCanEdit` + role admin/operador (RBAC já existente).
- Justificativa mínima 10 caracteres; gravada em `colaboradores.suspenso_motivo` + `auditoria.detalhes`.
- Alerta automático para gestor + admins por SendGrid (template novo, segue `style/email-visual-identity`).

### Métricas e visibilidade

- Dashboard: contadores de suspensões ativas, tempo médio até Leaver formal, gaps detectados.
- Relatório novo "Janela de risco de desligamento" listando todos os casos onde houve gap > 0 entre desligamento real (data da suspensão preventiva) e Leaver formal.

## Fora do escopo

- Detecção automática por comportamento anômalo (last sign-in, MFA changes) — exige integração extra com Entra ID Sign-in Logs; pode ser fase 2.
- Webhook do sistema de RH disparando o pré-desligamento automaticamente — depende do RH expor o evento, hoje só temos CSV.
- Alteração do contrato do CSV — fora do nosso controle.

## Resultado esperado

A janela de risco de até 5 dias deixa de ser silenciosa: vira uma ação proativa do RH com 1 clique, totalmente reversível, rastreada em JML/auditoria e reconciliada automaticamente com o Leaver formal quando o CSV finalmente atualizar.