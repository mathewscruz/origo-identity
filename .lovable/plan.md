# Painel 100% operacional, atividade recente clara e dashboard moderno

## 1. O que falta para operar tudo pelo painel (sem ir ao Hermes)

Lacunas confirmadas hoje:

- **Quarentena do RH sem tela**: 3.312 pendências abertas e nenhuma página para revisar. Criar a tela "RH em quarentena" (em Pessoas) com busca, filtros por motivo, paginação e decisão auditada (resolver / descartar). Evitar nova pendência repetida de "ausente no CSV" para a mesma pessoa (plano já aprovado).
- **Acompanhamento da importação do RH**: painel somente leitura em Integrações (arquivo, horário, situação, progresso, quantidades, erro completo). Links do Início passam a chegar nele.
- **Importação RH travada como "Ignorado"**: aplicar a correção já aprovada (reserva de execução com recuperação de travas expiradas; permitir voltar a um arquivo anterior).
- **Rotinas pelo painel**: "Executar agora" existe, mas o agente do servidor ainda não atende pedidos. Mostrar na aba Hermes Agent o estado de cada pedido (aguardando / em execução / concluído / erro com mensagem) e um aviso claro enquanto o agente não estiver na versão nova. Adicionar campo "Versão esperada do agente" em Parâmetros.
- **Ligar/desligar a agenda pelo painel**: interruptor "Agenda automática" (parâmetro lido pelo agente a cada ciclo), em vez de depender de `--schedule` no servidor. Exige atualizar o agente uma vez.
- **Fila**: ações em lote já existem; acrescentar "Reprocessar falhas por tipo" e "Cancelar selecionados" com motivo, ambos auditados, só para administradores.
- **Alerta de agente sem sinal**: alerta no sino quando o agente fica mais de 10 min sem contato.
- **Fora do escopo** (depende de integração de cada aplicação): criar/alterar usuários dentro de aplicações externas.

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

- Nova migration: RPC `dashboard_kpis(p_days)` com variações; `quarentena_decidir` revisada/auditada; parâmetros `agent_schedule_enabled`; alerta `agent_offline` gerado em `iam-agent-api` (sem pg_cron, conforme AGENTS.md).
- `dashboard_activity`: devolver ação normalizada e filtrar ações técnicas; textos montados em `src/lib/activityLabels.ts` com teste unitário.
- Executor Python: ler `agent_schedule_enabled`; precisa ser levado ao servidor.
- Componentes: `KpiCard` com sparkline (recharts), novos gráficos no `Dashboard.tsx`, página de quarentena reutilizando padrões de tabela existentes.
- Sem importação RH real, sem reconcile-identities, sem reprocessar fila, sem alterar identidades durante a implementação.
