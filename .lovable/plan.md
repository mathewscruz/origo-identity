Plano para corrigir usuários que não existem nem no AD nem no Entra ID:

1. **Endurecer a reconciliação de desligados**
   - Alterar `reconcile-identities` para não criar evento leaver nem itens `disable`/`disable_entra` quando o colaborador desligado não tiver correspondência confiável no Entra ID.
   - Tratar esses casos como `phantom/ignorado`, com contador próprio no job/auditoria.
   - Manter a regra atual: só sugerir desabilitar AD quando o Entra confirmar que a conta é sincronizada on-prem e ainda está habilitada.

2. **Remover os registros fantasmas do sistema**
   - Para colaboradores `desligado/inativo` de origem CSV sem match no Entra ID, apagar/arquivar a identidade do cadastro operacional.
   - Como há relacionamentos com fila/eventos/perfis, a limpeza será consistente: cancelar ações abertas relacionadas, remover vínculos ativos e eliminar o colaborador quando seguro.
   - Registrar a ação em auditoria para rastreabilidade.

3. **Limpar a fila atual**
   - Cancelar todos os itens abertos de `disable`/`disable_entra` criados pela reconciliação para usuários sem match confirmado.
   - Incluir mensagem clara: “Usuário não encontrado no AD/Entra ID — removido/ignorado pela reconciliação”.

4. **Backfill dos casos já existentes**
   - Rodar uma limpeza retroativa para localizar casos parecidos ao citado: desligados/inativos que não existem no Entra ID e estavam aparecendo na aprovação IAM.
   - Remover esses colaboradores fantasmas e cancelar suas ações abertas.

5. **Validação**
   - Conferir que a tela de aprovação IAM não mostra mais desabilitação para usuários inexistentes.
   - Conferir que futuras reconciliações não recriam esses mesmos itens.
   - Validar contagens no job/auditoria: ignorados/removidos, cancelados e desabilitações legítimas restantes.