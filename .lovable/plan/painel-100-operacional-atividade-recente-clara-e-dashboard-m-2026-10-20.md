# Painel 100% operacional, atividade recente clara e dashboard moderno

## 1. Sistema automático, sem botões de sincronização

Princípio: o usuário só aprova, decide e consulta. Sincronizar, verificar base e reconciliar acontecem sozinhos.

- **Remover botões e chaves** de sincronização, verificação de base, "Executar agora", ligar/desligar agenda e similares em todas as telas (Integrações, Pessoas, Aplicações, Licenças, Grupos, Hermes Agent). Fica apenas o botão de emergência "Pausar agente" (admin).
- **Automático ao acessar ou alterar**: ao abrir uma página (ex.: Aplicações, Licenças, Privilegiados) ou ao salvar uma alteração (perfil, cargo, pessoa), o painel registra um pedido de atualização para o Hermes, com limite de frequência (ex.: no máximo um por rotina a cada 15 min) para não sobrecarregar. A tela mostra discretamente "Atualizado há X min".
- **Agenda sempre ligada**: o agente roda as rotinas diárias por padrão (sem `--schedule`), respeitando só a pausa de emergência.
- **Quarentena e pendências → Hermes**: as 3.312 pendências da quarentena do RH e itens sem decisão clara são entregues ao Hermes, que resolve os casos com regra óbvia (ex.: ausência repetida da mesma pessoa, matrícula já resolvida) e registra cada decisão na auditoria. O que ele não conseguir decidir fica numa lista "Precisa de você" em Pessoas, só leitura + decisão.
- **Avisos por Telegram**: quando o Hermes precisar de um parâmetro ou decisão sua (ex.: valor faltando, regra ambígua, agente com erro, versão diferente), envia mensagem no Telegram com o que falta e o link da tela. Requer conectar um bot do Telegram e informar o chat de destino.
- **Acompanhamento do RH** (somente leitura) em Integrações e correção da importação travada como "Ignorado" (plano já aprovado).
- **Alerta de agente sem sinal**: no sino e no Telegram após 10 min sem contato.
- **Fora do escopo**: criar/alterar usuários dentro de aplicações externas (depende de integração de cada aplicação).

## 2. Atividade recente com linguagem de negócio

Trocar textos técnicos por frases macro, sempre "quem fez · o quê · em quem":

```text
Hermes criou o usuário João Silva no AD
Maria Souza recebeu a licença Microsoft 365 E3
Removido do grupo VPN-Financeiro: Pedro Lima
Ana (RH) desligou Carlos Reis
Admin aprovou exceção de acesso para Júlia
Importação do RH concluída: 16 readmitidos, 7 desligados
```

- Dicionário completo de ações (fila, JML, auditoria) com verbos no passado e recurso pelo nome.
- Agrupar itens repetidos (ex.: "Recebeu 5 grupos" com expandir).
- Esconder ruído técnico (ex.: `admin_exec_sql`, batimentos do agente) — ficam só na Auditoria.
- Status em selo curto (Concluído, Falhou, Aguardando aprovação).

## 3. Dashboard moderno

```text
[ Pessoas ativas ] [ Aguardando aprovação ] [ Falhas 24h ] [ Agente: Online ]
   número + variação vs semana anterior + mini-gráfico

[ Execuções por dia (barras empilhadas: sucesso/falha) ] [ Pessoas por status ]
[ Movimentações JML 30 dias (entradas/mudanças/saídas) ] [ Licenças: uso x total ]
[ Saúde: revisões abertas, exceções vencendo, terceiros vencidos, quarentena RH ]
[ Atividade recente (nova) ]
```

- Cartões com variação e mini-gráfico; todos clicáveis levando à tela filtrada.
- Filtro de período (7 / 30 / 90 dias).
- Barras de licenças com destaque quando acima de 90% de uso.

## Detalhes técnicos

- Nova migration: RPC `dashboard_kpis(p_days)` com variações; RPC `agent_refresh_request(p_task)` com throttle por rotina (usado ao abrir páginas e via triggers em alterações, gravando em `agent_tasks` — sem pg_cron, o Hermes continua o único executor, conforme AGENTS.md); novas tasks `quarantine_triage` e `pending_triage` na allowlist; `quarentena_decidir` auditada; alerta `agent_offline` em `iam-agent-api`.
- Hook `useAutoRefresh(task)` nas páginas; remoção dos botões/switches de sync e do "Executar agora".
- Telegram: conector Telegram + Edge Function `notify-telegram` (chamada pelo Hermes via `iam-agent-api` e por alertas críticos); parâmetro `telegram_chat_id`. Atualizar `AGENTS.md` e `roadmap.md`.
- `dashboard_activity`: devolver ação normalizada e filtrar ações técnicas; textos montados em `src/lib/activityLabels.ts` com teste unitário.
- Executor Python: agenda ligada por padrão, tasks de triagem com regras determinísticas e envio de "preciso de parâmetro" ao Telegram; precisa ser levado ao servidor.
- Componentes: `KpiCard` com sparkline (recharts), novos gráficos no `Dashboard.tsx`, página de quarentena reutilizando padrões de tabela existentes.
- Sem importação RH real, sem reconcile-identities, sem reprocessar fila, sem alterar identidades durante a implementação.
