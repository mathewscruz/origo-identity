# Contar no gráfico as pessoas cadastradas pelo Hermes

## O que encontrei hoje (20/10)
- **6 colaboradores** cadastrados pelo Hermes via Telegram às 13:37 (Valdenira, Liciane, Rene, Eliana, Izabella, Célio) e **1 terceiro** pelo GLPI às 14:21 (Lucas Lima De Araújo).
- Os colaboradores não entram porque o Hermes cria a pessoa direto, sem gerar o evento de admissão que o gráfico usa. A fila também registrou "usuário AD já existe", pois ele já tinha criado a conta antes.
- O terceiro só conta se o registro do GLPI disser explicitamente "conta criada". Isso precisa ser conferido no registro de hoje.

## O que vou corrigir
1. **Entradas também contam a admissão confirmada pelo Hermes**, ou seja, o registro "admissão autorizada via Telegram". Ela conta no dia do registro, uma vez por pessoa por dia. Admissões feitas pelo fluxo normal no mesmo dia não contam duas vezes.
2. **Terceiros do GLPI:** passam a contar quando o registro informa conta criada ou reconciliada com sucesso, mesmo que a forma de escrever esse campo varie. Antes, verifico o que o registro do Lucas traz e ajusto a regra a isso.
3. **Conferência:** o dia 20/10 tem que mostrar **7 entradas**, e as saídas de hoje continuam em 13.
4. Nada nas pessoas, na fila ou nos eventos é alterado. A mudança vale só para a contagem.

## Detalhes técnicos
- Recriar `dashboard_people_series` adicionando a CTE `hermes_joiner` a partir de `auditoria` com `entidade='colaboradores'` e `acao` em (`telegram_joiner_iam_created`, e variantes `%joiner%created%`), com pessoa `'colaborador:'||entidade_id`. A deduplicação já existe via `count(DISTINCT person)`.
- `third_party_creation`: aceitar `detalhes->>'ad_action'` em (`created`, `reconciled`, `exists_enabled`), conforme o que estiver nos detalhes reais. Verificar com uma consulta antes.
- Aplicar a mesma regra em `dashboard_kpis.admissoes`.
- Registrar a regra em `docs/people-lifecycle-chart.md` e em AGENTS.md, onde a linha do dashboard já existe.
