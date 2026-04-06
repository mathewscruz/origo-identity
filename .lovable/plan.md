

## Plano: Corrigir provisionamento quando sam_account_name esta ausente

### Causa raiz

O colaborador "Teste IAM 6" tem `sam_account_name = ""` no banco. A funcao `provisionCargoAcessos` exige esse campo para gerar entradas `assign_group`/`assign_license` na `iam_queue`. Como o campo esta vazio, o provisionamento de grupos/licencas e silenciosamente ignorado.

### Correcoes

#### 1. Validacao obrigatoria no formulario (ColaboradoresPage.tsx)

Ao salvar qualquer colaborador (novo ou edicao), se `sam_account_name` estiver vazio **e** o colaborador tiver cargo atribuido, exibir erro e impedir o salvamento. Mensagem: "Nome de login AD e obrigatorio para provisionamento de acessos".

#### 2. Alerta visual quando sam_account_name esta ausente

Na listagem de colaboradores, exibir um indicador visual (icone de alerta) ao lado de colaboradores que possuem cargo mas nao possuem `sam_account_name` preenchido.

#### 3. Feedback explicito quando provisionamento e ignorado (provisionCargoAcessos.ts)

Quando `sam` estiver vazio, em vez de silenciosamente pular a geracao de `iam_queue`, logar no console e retornar uma flag indicando que o provisionamento de diretorio foi ignorado. O chamador pode exibir um toast de aviso.

#### 4. Correcao imediata dos dados

O usuario precisa editar o "Teste IAM 6" e preencher o campo "Nome de login AD" com o valor correto (ex: `teste.iam6`). Ao salvar, o sistema automaticamente gerara as entradas `assign_group` para o perfil vinculado ao cargo.

### Resumo de arquivos

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` — tornar sam_account_name obrigatorio quando cargo esta presente; alerta visual na listagem |
| Editar | `src/lib/provisionCargoAcessos.ts` — retornar flag `skippedDirectory` quando sam vazio |

