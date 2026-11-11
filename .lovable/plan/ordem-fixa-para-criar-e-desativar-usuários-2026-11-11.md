# Ordem fixa para criar e desativar usuários

## Como funciona hoje
Os passos de uma pessoa entram na fila separadamente e o Hermes pega pela hora em que cada um foi criado. Não existe nenhuma regra de "só faça o passo 3 depois do 2". Por isso, às vezes a licença ou os grupos esperam, ou passam na frente da criação da conta. Também não existem os passos "enviar senha pelo Teams" nem "responder chamado".

## O processo que vou criar
Cada pessoa terá uma sequência numerada na fila. O Hermes só recebe o próximo passo quando o anterior terminou com sucesso. Se um passo falhar, os seguintes ficam em "Aguardando passo anterior" e você recebe um aviso.

```text
Criar usuário                      Desativar usuário
1 Criar no AD                      8  Desativar Entra ID
2 Replicar no Entra ID             9  Desativar AD
3 Licença (se houver)              10 Remover licença
4 Grupos                           11 Remover grupos
5 Apps (se houver)                 12 Remover apps
6 Ativar Litigation Hold           13 Responder chamado (se houver)
7 Enviar senha pelo Teams
```

- Passos "se aplicável" sem nada a fazer são pulados automaticamente (marcados como "Não se aplica").
- **Grupos que não podem ser removidos no desligamento** (ex.: grupos dinâmicos, grupos de outro diretório ou protegidos): ficam como "Não removível — ignorado", não contam como falha e o desligamento segue para o próximo passo. Aparecem listados no resumo do desligamento.
- **Senha (passo 7):** vai para quem abriu o chamado; se não houver chamado, para o gestor. Se nenhum dos dois tiver Teams/e-mail, o passo para e avisa você.
- **Chamado (passo 13):** só existe quando o pedido veio de um chamado (GLPI).
- O Litigation Hold só roda depois da licença, porque depende dela.
- Pedidos avulsos (ex.: "adicionar um grupo" a quem já está ativo) não entram nessa sequência e seguem como hoje.

## Na Fila
A linha do tempo de cada pessoa passa a mostrar os passos nessa ordem, com o passo atual destacado e os seguintes em cinza "aguardando".

## Detalhes técnicos
- Nova coluna `iam_queue.step_order int` (nula = item avulso) + índice por `correlation_id, step_order`. Preenchida no gatilho de inserção a partir de `action_type` + fluxo (joiner/leaver), com o `correlation_id` do evento como agrupador.
- Novos action_types: `replicate_entra` (aguarda a sincronização AD→Entra e confirma o objectId), `send_password_teams`, `reply_ticket`. Adicionar à lista permitida e aos rótulos.
- `claim_iam_queue_items`: item com `step_order` só é entregue quando todos os itens do mesmo `correlation_id` com ordem menor estão em success/skipped. Ordenação por `correlation_id, step_order`.
- Em `remove_group` (leaver), erros de grupo não removível (dinâmico, sincronizado de outro diretório, permissão negada) viram `skipped` com `error_code='group_not_removable'`, liberando o passo seguinte; demais erros seguem como falha.
- Status `skipped` para passos não aplicáveis (validar na transição).
- Ajustar `jml_provisionar_cargo`, o caminho de desligamento e `enqueue_litigation_hold_after_license` para gerar a sequência completa.
- Testes: ordem (passo N não é entregue antes de N-1), pulo de passos opcionais, grupo não removível não bloqueia o desligamento, destino da senha (solicitante > gestor).
- **Dependência do Hermes:** enviar mensagem no Teams e responder no GLPI precisam ser implementados no próprio Hermes. O painel cria e ordena os passos; até o Hermes ser atualizado, esses dois ficam aguardando.
