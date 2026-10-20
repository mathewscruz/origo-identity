# Conectar sistemas em Aplicações, com assistente

## O que você vai ter

Em **Aplicações**, um botão **"Conectar sistema"** abre uma tela dividida:

```text
+-------------------------------+---------------------------+
| Conversa com o assistente     | Ficha do sistema (ao vivo)|
|                               | Nome, link, descrição     |
| "Quero conectar o GLPI. O     | Dono  [colaborador]       |
|  acesso é pelo grupo          | Revisor [colaborador]     |
|  GLPI-Usuarios no AD."        | Forma de acesso:          |
|                               |  ( ) API  (x) Grupo       |
| Assistente: "Entendi. Há      |  ( ) Instrução manual     |
|  perfis diferentes dentro     | Perfis internos           |
|  dele (técnico, admin)?"      | Teste do Hermes: ok/erro  |
|                               | [Salvar e ativar]         |
+-------------------------------+---------------------------+
```

- Você descreve o sistema do seu jeito: cola um link, documentação, o nome do grupo ou explica o passo a passo.
- O assistente faz perguntas até a ficha ficar completa, e você também pode editar a ficha direto.
- Cada sistema conectado tem **dono** e **revisor** (um colaborador cada).
- Depois de salvo, o sistema aparece em **Perfis de Acesso** e pode ser ligado aos cargos, como já acontece hoje com as aplicações.
- A conversa fica salva junto da aplicação: dá para voltar depois e ajustar ("agora também tem o perfil financeiro").

## Três formas de acesso

1. **Por grupo**: o acesso vem de estar num grupo do AD ou do Entra. O assistente encontra o grupo no catálogo. Para dar acesso, o Hermes coloca a pessoa no grupo, e para tirar, remove.
2. **Por API**: você informa o endereço, o tipo de autenticação e a documentação. As chaves e senhas são digitadas num campo protegido, nunca no chat. O Hermes testa a conexão e descobre os perfis internos. O acesso é feito com as ações de criar, atualizar e desabilitar o usuário no aplicativo.
3. **Manual / instrução**: para sistemas sem integração. Você explica o passo a passo em linguagem natural. Quando alguém precisa de acesso, o Hermes cria uma tarefa com a instrução, avisa o dono pelo Telegram do Hermes e espera a confirmação de que foi feito.

## Papel do Hermes

- Recebe a ficha pronta. Testa a conexão (API) ou confere se o grupo existe, e grava o resultado na ficha.
- Executa as concessões e revogações pela fila de sempre, com aprovação e auditoria.
- Nos casos manuais, avisa o dono e acompanha até a confirmação.

## Dono e revisor

- **Dono**: aprova os pedidos de acesso ao sistema e recebe os avisos dos casos manuais.
- **Revisor**: recebe as campanhas de revisão de acessos daquele sistema.
- As campanhas de revisão por aplicação passam a ir para o revisor (e para o dono se não houver revisor).

## Detalhes técnicos

- Banco (migration aditiva): em `aplicacoes`, novas colunas `owner_colaborador_id`, `revisor_colaborador_id`, `modo_acesso` (`grupo` | `api` | `manual`), `instrucoes_acesso` e `teste_status`/`teste_em`/`teste_detalhe`. Nova tabela `aplicacao_chat_mensagens` (uma conversa por aplicação; RLS para admin/operador; GRANTs). Ligação aplicação↔grupo pela tabela existente de perfis/grupos.
- Credenciais de API ficam em `aplicacao_connectors.config` (já existente) e só são gravadas por um formulário protegido, nunca pela IA.
- Edge Function `app-connect-assistant`: chat por streaming com o Lovable AI Gateway (modelo padrão), com ferramentas `atualizar_ficha`, `buscar_grupo` (catálogo `entra_grupos`) e `buscar_colaborador`. Salva as mensagens e devolve a ficha atualizada.
- Interface com AI Elements: tela `/aplicacoes/conectar` (nova) e `/aplicacoes/:id/conectar` (edição), com a ficha editável ao lado.
- Hermes: nova task `test-app-connection` na allowlist (`iam-agent-api` + `agent_refresh_request`). Nova ação de fila `manual_access_task` para o modo manual, que gera um alerta para o dono (o Hermes repassa pelo Telegram dele) e só é concluída por confirmação na tela.
- Recursos do perfil (`iam_resource_template`) passam a respeitar `modo_acesso`: grupo → `assign_group`/`remove_group`; api → `*_user_app`; manual → `manual_access_task`.
- `revisao_criar` por aplicação usa `revisor_colaborador_id`.
- Registrar a decisão no `AGENTS.md`, testes para a escolha de ação por modo de acesso, e verificação de ponta a ponta conectando um sistema por grupo.
- Proteções: nenhuma alteração de identidades ou da fila existente durante a implementação.
