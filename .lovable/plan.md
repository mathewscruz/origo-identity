

## Plano: Criar endpoint de reset de senha administrativa

### Problema
Os 3 usuarios admin existem no sistema e estao ativos, mas as senhas cadastradas nao correspondem ao que esta sendo digitado. Os logs confirmam erro `invalid_credentials` em todas as tentativas recentes.

### Solucao
Criar uma edge function `admin-reset-password` que permite redefinir a senha de um usuario existente usando o service role key. Como nenhum admin consegue logar atualmente, a funcao precisara de uma abordagem de bootstrap — aceitar um token secreto temporario para o primeiro reset.

**Alternativa mais simples (recomendada):** Usar o fluxo de "Esqueceu a senha" que ja existe na tela de login. O usuario clica em "Esqueceu a senha?", digita o email, e recebe um link para redefinir. Isso ja esta implementado no `LoginPage.tsx` e na rota `/reset-password`.

### Pergunta antes de prosseguir

Qual abordagem voce prefere?

1. **Usar "Esqueceu a senha"** — Cada usuario clica no link na tela de login e redefine via email. Nao precisa de codigo novo.
2. **Criar endpoint de reset administrativo** — Uma edge function que permite forcar nova senha para qualquer usuario (requer autenticacao ou token secreto).
3. **Redefinir senhas diretamente agora** — Posso criar um script unico que redefine as senhas dos 3 usuarios para valores que voce me informar.

