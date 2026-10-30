# Roadmap

- [x] Padronizar os indicadores de exceções vencendo em 15 dias e abrir a lista correspondente (verificado com sessão real)
- [x] Corrigir os caracteres corrompidos nas atividades recentes usando nomes anteriores verificados, sem alterar identidades; proteger a leitura do CSV RH (27 testes aprovados, tela sem símbolos)

- [x] Verificar recusas de autenticação: heartbeat recente e pedidos concluídos; logs não identificam o chamador rejeitado
- [ ] Identificar chamador recusado e confirmar configuração no servidor Hermes (bloqueado: sem acesso ao processo/configuração externa; não alterar credenciais por hipótese)
- [x] Corrigir e validar filtro Super Admins em Usuários do painel (4 administradores reais exibidos; teste de regressão aprovado)

- [x] Remover botões de sincronização/“Executar agora”; atualização automática ao abrir páginas
- [x] Triagem automática da quarentena RH + página "Precisa de você"
- [x] Avisos por Telegram via Hermes (configurar HERMES_NOTIFY_CMD no servidor)
- [x] Alerta agente sem sinal (10 min)
- [x] Atividade recente em linguagem de negócio
- [x] Dashboard moderno
- [ ] Executor Hermes atualizado no servidor (bloqueado: depende de vocês levarem a versão ao servidor)

## Visual "Lista com painel" (opção C)
- [x] Faixa de números + painel lateral em Colaboradores
- [ ] Mesmo padrão em Terceiros e Contas de serviço
- [ ] Fila, Licenças, Aplicações
- [ ] Privilegiados, SoD, Exceções, Revisões, Auditoria
