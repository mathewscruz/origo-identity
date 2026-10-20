# Perfis de quem opera o IAM: Super Admin, Suporte e Leitor

## Situação atual (validada)
- Existem 4 papéis: Platform admin, Administrador, Operador e Somente leitura. São 5 contas: Mathews (Platform admin e também Administrador), Henrique, Ana e a conta do Hermes (Administrador).
- A criação de usuários do painel funciona, mas só para Administradores. Ela envia e-mail de boas-vindas com senha temporária e registra auditoria.
- Hoje o Operador ainda consegue editar cargos, perfis de acesso e aplicações, o que é cadastro e configuração.
- O papel "Somente leitura" existe, mas nunca foi usado.

## Como fica
| Perfil | Pode | Não pode |
|---|---|---|
| **Super Admin** | Tudo: configurações, usuários do painel, cargos, perfis, aplicações, Hermes, exclusões | — |
| **Suporte** | Criar e editar colaboradores e terceiros, atribuir grupos, licenças e perfis, desativar ou reativar pessoas, aprovar e acompanhar a fila | Configurações, Usuários do painel, cargos, perfis de acesso, aplicações e exclusões |
| **Leitor** | Ver dashboard, listas e detalhes | Qualquer ação: os botões ficam ocultos e o banco também bloqueia |

- Henrique, Ana, Mathews e a conta do Hermes passam a **Super Admin**.
- Ao criar um usuário do painel, só aparecem as três opções: Super Admin, Suporte e Leitor.

## Validação ao final
- Criar um Suporte e um Leitor de teste, entrar com cada um e confirmar o que aparece e o que é bloqueado.
- Tentar a ação proibida direto no banco para provar que o bloqueio também vale fora da tela. Depois, excluir as contas de teste.

## Detalhes técnicos
- Sem mudança destrutiva no enum. O mapeamento fica: `platform_admin` = Super Admin, `operador` = Suporte e `viewer` = Leitor. `admin` é marcado como DEPRECATED e mantido só como alias.
- Migração de dados: os papéis `admin` viram `platform_admin`, removendo duplicados.
- `has_role(...,'admin')` já inclui `platform_admin`, então as políticas atuais restritas a admin passam a ser só do Super Admin.
- Nova migration: em `cargos`, `perfis_acesso`, `aplicacoes`, `cargo_perfis`, `perfil_aplicacoes`, `perfil_grupos`, `perfil_licencas`, `perfil_sharepoint`, `sod_conflitos`, `aplicacao_*`, `areas`, `empresas` e `localidades`, trocar INSERT/UPDATE de `admin OR operador` para só `admin`.
- Revisar as RPCs `security definer` que usam `iam_assert_operator` (fila, JML, terceiros), que continuam permitidas ao Suporte. Também verificar se a RPC de pausar o Hermes, os parâmetros e `admin_*` exigem admin.
- `admin-users`: aceitar só os papéis `platform_admin`, `operador` e `viewer`, com rótulos novos. Só Super Admin cria usuários.
- Frontend: `useCanEdit` (Suporte+), novo `useIsSuperAdmin`. Proteger por rota `/configuracoes/*` e `/admin/*`, e esconder edição de cargos, perfis e aplicações (incluindo "Conectar sistema") para quem não é Super Admin. Atualizar os rótulos de papel na interface.
- Testes em `src/test/roles.test.ts` com a matriz de permissões por papel.
- Atualizar a memória `auth/access-control` com os 3 perfis.
