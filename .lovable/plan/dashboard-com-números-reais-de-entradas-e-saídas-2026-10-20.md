# Dashboard com números reais de entradas e saídas

## O que encontrei
- **O gráfico e o card de entradas/saídas mostram zero saídas há pelo menos 30 dias.** A conta só considera um tipo de registro de desligamento que o fluxo atual não grava mais.
- **Desligamentos reais que ficaram de fora:**
  - Hoje (20/10): 13 pessoas.
  - Ontem (19/10): 1.
  - 15/10: 1.
  - 14/10: 7.
  - Nos últimos 7 dias, 42 desativações foram concluídas com sucesso pela fila, todas ligadas a desligamentos executados.
- As entradas também ficam incompletas: só contam quando a mensagem do AD bate com um de 6 textos exatos. Qualquer texto diferente faz a entrada sumir.
- O card "Pessoas ativas" soma desligamentos e admissões ainda **pendentes**, como se tivessem acontecido. Há 17 admissões e 12 desligamentos pendentes desde setembro que nunca foram concluídos.

## O que vou corrigir
1. **Nova regra de entrada e saída**, baseada no que de fato aconteceu:
   - **Saída:** desligamento executado (colaborador ou terceiro). Conta no dia em que a conta foi desativada com sucesso.
   - **Entrada:** admissão executada, ou terceiro cadastrado com conta criada. Conta no dia em que a conta foi criada e habilitada com sucesso.
   - Cada pessoa conta uma vez por dia. Pendentes e falhas não contam.
2. **Card "Pessoas ativas":** o texto de admissões e desligamentos passa a contar só os executados, com a mesma regra do gráfico.
3. **Revisar os demais números do dashboard**: falhas em 24 h, aguardando aprovação, quarentena, revisões, exceções vencendo, terceiros vencidos, licenças e situação das pessoas. Para cada um, comparo o valor da tela com uma contagem direta no banco e corrijo o que divergir.
4. **Pendências antigas de setembro:** aparecem como alerta "Eventos de entrada/saída parados há mais de 7 dias", para você decidir. Não altero esses eventos automaticamente.
5. **Relatório final:** tabela "dashboard × banco" de cada número, com o resultado de hoje.

## Detalhes técnicos
- Recriar `dashboard_people_series(p_days)` (SECURITY DEFINER, `search_path` fixo). Fontes:
  - `eventos_jml` com tipo `joiner` ou `leaver` e status `executado`.
  - `iam_queue` com status `success` e `action_type` de criação ou desabilitação, para datar pelo `processed_at`. Se não houver item na fila, usar o `updated_at` do evento.
  - Auditoria de cadastro de terceiro, como já existe hoje.
- Dedupe por pessoa, tipo e dia em `America/Sao_Paulo`. Manter o formato de retorno `{dia, entradas, saidas}`.
- `dashboard_kpis`: `admissoes`/`desligamentos` filtrando `status='executado'`.
- Teste SQL de aceitação: a série de 7 dias tem que mostrar saídas ≥ 13 em 20/10 e ≥ 7 em 14/10.
- Nada em `iam_queue`, `eventos_jml` ou `colaboradores` é alterado; a mudança é só na leitura.
