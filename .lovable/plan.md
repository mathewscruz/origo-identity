# Ícone próprio para cada ação da Atividade recente

## Problema
Hoje muitas ações diferentes compartilham o mesmo ícone (ex.: criar pessoa, atribuir perfil e cadastrar terceiro usam o mesmo "pessoa +"; SQL, comandos e reprocessos caem num documento genérico). Fica difícil bater o olho e entender o que aconteceu.

## O que muda
Cada tipo de ação passa a ter seu próprio ícone e cor, mantendo o "H" do Hermes para o que ele fez sem ação específica:

| Ação | Ícone | Cor |
|---|---|---|
| Criou colaborador / admissão | pessoa com + | verde |
| Cadastrou terceiro (inclui GLPI, lote) | crachá | verde |
| Chamado GLPI atendido | ticket | teal |
| Desligamento / pessoa desativada | pessoa com − | vermelho |
| Desligamento bloqueado / falso desligamento corrigido | escudo de alerta | amarelo |
| Reativação / mudança de status | interruptor | azul |
| Mudança de cargo (mover) | setas de troca | azul |
| Atribuiu perfil | escudo com + | verde |
| Revogou perfil | escudo com − | vermelho |
| Ligou cargo a perfil | corrente | azul |
| Licença | chave | azul |
| Grupo | grupo de pessoas | azul |
| Aplicação (criar/editar/excluir) | janela | conforme ação |
| Senha redefinida | cadeado com seta | amarelo |
| Revisão de acesso (criar/excluir/e-mail) | prancheta com check | teal |
| Exceção de acesso | triângulo de alerta | amarelo |
| Importação da Base do RH / equalização | nuvem com seta | azul |
| Aprovação / recusa na fila | martelo / X | verde / vermelho |
| Reprocessamento de falhas | seta circular | azul |
| Comandos administrativos (SQL, funções) | terminal | cinza |
| Edição de cadastro (cargo, área, empresa) | lápis | azul |
| Exclusão de usuário do painel | lixeira | vermelho |
| Item da fila: sucesso/falha/processando/aguardando | mantém os atuais | — |

## Detalhes técnicos
- Reescrever `acaoIcon` em `src/components/ActivityFeed.tsx` como um mapa explícito `ACAO_ICON` (ação exata → ícone/tom) consultado primeiro, com as regras por prefixo atuais como fallback e o HermesIcon como último recurso para ator Hermes.
- Ações da fila (`fonte === "fila"`) com status success passam a usar o ícone do tipo do recurso (licença, grupo, conta) com tom verde, em vez do check genérico.
- Teste em `src/test/activity-labels.test.ts`: ações distintas (ex.: `terceiro_cadastro_criado`, `atribuir_perfil`, `revogar_perfil`, `admin_exec_sql`) retornam ícones diferentes.
