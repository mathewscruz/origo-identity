# Frontend RH + fila IAM — entrega local

## Resultado e escopo
- Clone isolado `/root/iam-frontend-fix`, branch `fix/frontend-data-integrity`; preservado commit anterior `bbaf304`.
- Dashboard consome campos aditivos `rh_entradas`, `rh_saidas`, `rh_parciais`, `rh_cadastrais` do contrato `/root/iam_rh_activity_contract.md`. Campos ausentes/incompletos são indisponibilidade, não zero. Não agrega contagens RH às ações da fila. `rh_ad_bloqueios` não é somado novamente em revogações.
- Fila continua em ações; RH em pessoas por ocorrência. JML explicitamente eventos registrados, não execuções. Bloqueio/desligamento não é exclusão da conta.
- Feed individual mostra pessoa, ação, origem/fonte, status para auditoria também, detalhe completo e link; filtro RH envia `p_categoria=rh` antes do limite no servidor. Dedupe no cliente somente `fonte+id`; dedupe semântico por pessoa/correlação pertence ao backend. Nenhuma execução IAM foi repetida.
- Patch `/root/iam_rh_cards_fix/frontend-cards.patch` aplicado sem conflito: coleta não importada e ciclo pausado exibidos corretamente.
- Nenhum SQL, runtime compartilhado, autenticação ou infraestrutura alterados.

## Validação
- `npm test`: 8 arquivos, 23 testes aprovados (inclui testes anteriores preservados).
- `npx tsc --noEmit -p tsconfig.app.json`: aprovado.
- `npm run build`: aprovado; avisos existentes de Browserslist desatualizado e chunk >500KB.
- Playwright local com interceptação e **dados fictícios**, não produção: 14 pessoas separadas; status parcial/final; filtro RH; período 7 dias; alternância de legenda; navegação individual; erro de leitura; desktop e 390px; nenhum pageerror ou overflow horizontal. Duplicatas, pending, error, loading, filtros e ausência de contrato também cobertos por Vitest.
- Encontrada sobreposição da legenda Recharts no mobile durante QA; corrigida com botões acessíveis externos ao gráfico e retestada. Screenshots `*-fixture-*.png` são apenas fixtures.
- Browser gerenciado falhou ao iniciar; Playwright instalado no próprio clone funcionou. UI publicada inspecionada somente até login, sem autenticação.

## Publicação BLOQUEADA / pipeline existente
- `gh` indisponível; helper Git e variáveis GH_TOKEN/GITHUB_TOKEN ausentes. Não foram pedidos nem pesquisados tokens em histórico; não houve push.
- README documenta GitHub main → sync/preview Lovable → Publish manual. `.lovable/mcp/manifest.json` é metadado MCP, não pipeline deploy. Nenhum workflow `.github` versionado. Nenhum hosting ou workflow novo criado.
- `https://origo-identity.lovable.app` redireciona a `https://iam.origoenergia.com.br/`. HTTP 200; browser redireciona a `/login`, sem erros JS.
- Bundle publicado observado: `/assets/index-BxKjOPpT.js`, SHA256 `75801b70af5972f2cebde13acdff8a3e509cfd5c3e43b8989d3421ff53de409f`. Ainda contém título antigo e não contém `rh_parciais`. Build local **não está publicado**.
- Após integrar patch no repositório sincronizado, usar fluxo existente de revisão/main e Publish no Lovable. Arquivo estático dist é artefato de validação/entrega, não prova de deploy.

## Compatibilidade backend com UI antiga
As assinaturas RPC e chaves antigas foram preservadas pelo contrato. Quando o backend for aplicado, a UI antiga pode receber ações atualizadas e feed RH como `fonte=auditoria` sem redeploy, mas não exibirá novos traçados RH, badges de status da auditoria ou origem RH; o frontend desta entrega é necessário para leitura correta/completa. Esta etapa frontend não aplicou nem verificou SQL de produção e não afirma números reais finais de desligamentos.

## Artefatos
Diretório `/root/iam-frontend-artifacts/`: patch incremental após bbaf304, patch completo após 0fca9db (inclui integridade anterior), tar.gz do dist, evidências HTTP/bundle, screenshots e resultado JSON Playwright. Harness `qa-rh.html`, `qa-rh.tsx`, `qa-rh.mjs` é mantido apenas nos artefatos, fora do build normal. Para repetir, copiar temporariamente para raiz do clone, subir Vite em 127.0.0.1:8184, executar `node qa-rh.mjs` e remover os três arquivos.
