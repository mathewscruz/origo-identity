# Por que a criação de "Energ.IA" está demorando

## O que os dados mostram
- O pedido "Criar conta" (conta de serviço GLPI #100707) entrou às 10:53 (São Paulo) e já foi **pego pelo Hermes 4 vezes**, sem nenhum retorno de sucesso ou erro. A cada vez ele "segura" o item por 30 minutos; a última pega foi às 12:02 e só expira às 12:32.
- Porém a conta **já existe no Entra ID**: às 11:50 a sincronização encontrou o usuário (com identificador no Entra) e importou os 3 grupos dinâmicos dele.
- O pedido de licença Microsoft 365 E3 (11:50) está parado esperando a criação terminar.
- Conclusão: o Hermes tenta criar uma conta que já existe e não devolve o resultado ao painel (provavelmente trava ou falha sem reportar). O item fica girando em ciclos de 30 min e a licença nunca sai da fila.

## O que vou fazer
1. **Destravar este caso**: marcar a criação de Energ.IA como concluída ("conta já existente no Entra"), registrando na Auditoria, para a licença E3 seguir para o Hermes.
2. **Evitar repetição**: antes de entregar um "Criar conta" ao Hermes, o painel verifica se a pessoa já tem conta no Entra; se tiver, conclui automaticamente como "já existente" em vez de mandar criar.
3. **Limite de tentativas**: se o Hermes pegar o mesmo item 3 vezes sem responder, o item vira "Falhou — Hermes sem resposta" com aviso (alerta e Telegram via Hermes), em vez de girar indefinidamente.
4. **Na Fila**: mostrar no painel do item "Tentativa X · Hermes trabalhando há Y min" para ficar claro quando algo está travado.

## Detalhes técnicos
- Caso pontual: update de `iam_queue` id 20038826 → `success`, `result_message` "Conta já existente no Entra (c3929cf2…)", limpando claim/lease; auditoria.
- Na RPC de claim (`agent_task`/`/pending` da iam-agent-api): para `create_if_not_exists` com colaborador/terceiro que já possui `entra_id`, finalizar como success sem entregar.
- `claim_attempts >= 3` sem resultado → `failed`, `error_code='agent_no_response'`, gerar `alertas`.
- Teste para a regra de limite de tentativas e para o atalho de conta já existente.
- Verificar também por que o Hermes não reporta (logs do agente no servidor ficam fora do meu alcance; sinalizo se necessário).
