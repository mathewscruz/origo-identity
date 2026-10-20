# Hermes analisa o link ou a documentação ao conectar um sistema

## O que você vai ter
Na conversa de "Conectar sistema" você pode colar um link, anexar um arquivo (PDF, Word, TXT, JSON/YAML de API) ou só explicar como funciona.

- O painel **não lê nada sozinho**: ele envia o pedido de análise ao **Hermes**, e a ficha mostra "Hermes analisando…".
- O Hermes abre o link ou o arquivo, entende o sistema e devolve um **diagnóstico**:
  - a melhor forma de conectar (grupo, API ou manual) e o porquê;
  - se for API: endereço, tipo de autenticação e como criar, desativar e consultar um usuário;
  - os perfis internos que encontrou (ex.: Leitor, Aprovador);
  - o que ficou faltando.
- O diagnóstico aparece na conversa como um cartão **"Aplicar na ficha"**. Você marca o que quer usar e confirma. Nada é gravado sem a sua confirmação.
- Se o Hermes não responder em alguns minutos, o cartão mostra "Hermes ainda não respondeu" e você pode continuar a conversa normalmente.

## Regras
- Nenhum serviço de leitura de sites fora o Hermes. O Firecrawl não é usado.
- Credenciais nunca entram no diagnóstico. Se o Hermes encontrar uma chave, ela é descartada e você é avisado para colocá-la no campo protegido.
- Páginas que pedem login: o Hermes avisa e pede o arquivo.

## Detalhes técnicos
- Arquivos: bucket privado `app-docs` (já criado, 10 MB), com políticas para admin/operador enviarem e o Hermes ler pelo link assinado.
- Nova tarefa `analyze-app-docs` na allowlist (`agent_refresh_request`/`agent_tasks`, `iam-agent-api` e MCP `MCP_AGENT_TASKS`), com payload `{aplicacao_id, url?, arquivo_url_assinada?, observacao?}`.
- Ferramenta do assistente `pedir_analise_hermes` cria a tarefa. O Hermes devolve o diagnóstico em `agent_tasks.result` por `POST /task_result` ou pela MCP `run_agent_tasks`, no formato {modo_sugerido, motivo, api_base_url, auth_type, actions{create,disable,lookup}, perfis[], lacunas[]}.
- O painel faz a limpeza de segredos ao receber o resultado, e de novo ao aplicar.
- Front: botão de anexo no chat, cartão de diagnóstico com acompanhamento em tempo real da tarefa e checkboxes por item. O "Aplicar" grava em `aplicacoes`, `aplicacao_connectors.config` (sem tocar na credencial) e `aplicacao_perfis_internos`.
- Executor do Hermes (`agent/origo_iam_agent_executor.py`) e playbook MCP: instruções para tratar `analyze-app-docs`.
- Testes: filtro de segredos, conversão do diagnóstico para a ficha e allowlist contendo a nova tarefa.
- `AGENTS.md`: a análise de documentação é feita só pelo Hermes, nunca pelo painel ou por um serviço de leitura de sites.
