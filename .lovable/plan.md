# Conectar sistema: o que falta e o que melhorar

## O que verifiquei
- Hoje existe só 1 sistema cadastrado, um rascunho chamado "Novo sistema", sem dono, sem revisor, sem perfil e nunca testado.
- **Por grupo:** funciona de ponta a ponta. A pessoa entra ou sai do grupo do AD/Entra.
- **Manual:** funciona. O dono recebe uma tarefa e a fecha clicando em "Confirmar que foi feito".
- **Por API:** está incompleto. O teste só verifica se o endereço responde. O Hermes não tem rotina para criar nem desativar o usuário no sistema externo. Esses pedidos ficariam parados na fila.
- O teste de conexão só roda logo depois de salvar. Se o sistema cair depois, ninguém fica sabendo.

## O que proponho

1. **Terminar o modo por API (o principal)**
   - Na ficha, o assistente pergunta e registra as três ações: como criar, como desativar e como checar se o usuário já existe (endereço, método e campos que vão no pedido: nome, e-mail, matrícula, perfil).
   - O Hermes passa a executar essas ações e grava o resultado na fila: feito, já existia ou falhou com o motivo.
   - Botão "Testar com um usuário de teste" na ficha. Ele só consulta o sistema e não cria ninguém.

2. **Perfis internos do sistema**
   - O assistente pergunta quais papéis o sistema tem (ex.: Leitor, Aprovador) e os cadastra.
   - No Perfil de Acesso, você escolhe qual papel cada cargo recebe naquele sistema.

3. **Ligar ao cargo direto da ficha**
   - Último passo da conversa: "Quais cargos ou perfis devem receber este sistema?" O sistema já fica ligado ao perfil certo, sem precisar ir a outra tela.

4. **Saúde contínua**
   - O Hermes testa de novo todos os sistemas conectados uma vez por dia.
   - Se um teste falhar, aparece "Falhou" na lista e o aviso vai para o sino e para o Telegram do Hermes.

5. **Lista de Aplicações mais útil**
   - Novas colunas: forma de acesso (Grupo, API ou Manual), dono, revisor e situação (Rascunho, Conectado, Falhou).
   - Filtro "Incompletos" para achar rascunhos como o "Novo sistema".
   - O botão de editar passa a abrir a ficha/conversa, em vez da janela antiga.

6. **Modelos prontos**
   - Atalhos no início da conversa: "Sistema com login Microsoft (grupo)", "Sistema com API REST", "Sistema sem integração (manual)". Cada um já vem com a ficha pré-preenchida.

## Fora do escopo
- Credenciais continuam só no campo protegido, nunca no chat.
- Nenhuma pessoa recebe ou perde acesso durante a implantação.

## Detalhes técnicos
- `aplicacao_connectors.config`: incluir `actions` {create, disable, lookup}, cada uma com {method, path, body_template}. Templates com {{nome}}, {{email}}, {{matricula}} e {{perfil_externo}}.
- Nova ferramenta `atualizar_acoes_api` e `cadastrar_perfis_internos` no `app-connect-assistant`. Ferramenta `ligar_perfis` grava em `perfil_aplicacoes` e `perfil_apps_internos`.
- Executor do Hermes: novos tipos `app_api_create`/`app_api_disable` em AGENT_ACTION_TYPES, com credenciais lidas server-side via iam-agent-api (endpoint protegido por token do agente) e resultado em `complete_iam_queue_item`. `iam_resource_template` gera esses tipos quando `modo_acesso='api'`.
- SCHEDULE diário `test-app-connection` com modo `todos` (não só os pendentes).
- Testes: renderização do template e regra de `fichaPendencias` para o modo API exigindo as ações create e disable.
