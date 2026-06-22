---
name: Pré-Desligamento (Suspensão Preventiva)
description: Fluxo manual para bloquear acessos imediatamente quando o RH detecta desligamento real antes do CSV atualizar
type: feature
---

# Pré-Desligamento — Suspensão Preventiva

Mitiga a janela de até 5 dias entre o desligamento real e a atualização do status `inativo` na planilha do RH.

## Quem pode acionar
- Admin/operador, via botão vermelho "Suspender Acessos" em `ColaboradorDetalhePage`.
- Visível somente quando `status='ativo'` e `suspenso_preventivo=false`.
- Justificativa obrigatória (mín. 10 caracteres).

## Efeitos imediatos
- `iam_queue`: `disable` (AD on-prem) + `disable_entra` (com `revokeSignInSessions=true`).
- `colaboradores.suspenso_preventivo=true` + `suspenso_em`, `suspenso_por`, `suspenso_motivo`.
- Evento JML `pre_leaver` com snapshot.
- Alerta crítico + auditoria + notificação ao gestor (template `colaborador_desabilitado`).
- **Não revoga** licenças, grupos, perfis ou apps — preservados para o Leaver formal.

## Reversão
- Botão "Reverter Suspensão" (verde) na mesma tela, mesma exigência de justificativa.
- Enfileira `update` (AD enable) + `enable_entra`, limpa flags, registra `pre_leaver_revertido`.

## Reconciliação com o Leaver formal
- Quando o CSV finalmente flipa `ativo → inativo/desligado`, `handleStatusChange` detecta `suspenso_preventivo=true`:
  - Pula re-emissão de `disable`/`disable_entra` (já em curso).
  - Executa revogação de recursos (perfis, individuais) normalmente.
  - Registra `pre_suspensao_aplicada: true` e `gap_dias` no `dados_antes` do evento `leaver`.
  - Limpa os flags `suspenso_*` do colaborador.

## Código
- `src/lib/preLeaver.ts` — `suspendColaboradorPreventivo`, `revertSuspensaoPreventiva`.
- `src/lib/colaboradorLifecycle.ts` — reconciliação no `handleStatusChange`.
- `src/lib/createEventoJML.ts` — aceita `pre_leaver` e `pre_leaver_revertido`.
- `src/pages/colaboradores/ColaboradorDetalhePage.tsx` — botões, badge, AlertDialogs.

## Banco
- `colaboradores`: `suspenso_preventivo bool`, `suspenso_em timestamptz`, `suspenso_por text`, `suspenso_motivo text` (+ índice parcial).
- `tipo_evento_jml`: enum amplia com `pre_leaver`, `pre_leaver_revertido`.
