# Pendências de governança clicáveis + revisão geral

## Parte 1 — Cada pendência abre exatamente os seus itens

Hoje cada linha do quadro "Pendências de governança" no Início abre a página geral (ex.: "Contratos vencidos" abre todos os terceiros, "Ativos sem cargo" abre todos os colaboradores ativos). A página não usa o filtro, então parece que o clique "não leva a nada".

Cada item passa a abrir a página já filtrada, com um chip "Filtro: X ×" no topo para limpar. O número da lista bate com o número do quadro.

| Pendência | Abre em |
|---|---|
| Exceções pendentes | Exceções, aba Pendentes |
| Exceções vencendo | Exceções, só as que vencem em breve |
| Revisões abertas / atrasadas | Revisões, filtradas por aberta / atrasada |
| Contratos vencidos / vencendo (30 d) | Terceiros, filtrados por contrato vencido / vencendo |
| Terceiros a revalidar | Terceiros, só os que precisam revalidar |
| Conflitos de acesso (SoD) | Conflitos, só as violações abertas |
| Licenças críticas | Licenças, só as críticas (acima do contratado ou quase no limite) |
| Contas órfãs no Entra | Fila > Aprovação, filtrada por órfãs (já funciona, confirmar) |
| RH: precisa de você | Quarentena (já funciona, confirmar) |
| Ativos sem conta Entra / sem cargo | Colaboradores ativos filtrados por "sem conta Entra" / "sem cargo" |
| Acessos privilegiados | Acessos Privilegiados, aba de atribuições |

Os mesmos filtros servem para os 4 cartões do topo do Início ("Terceiros vencidos" etc.).

## Parte 2 — Revisão geral de erros e inconsistências

Primeiro levantar os problemas, depois corrigir só o que estiver confirmado:
- Abrir todas as páginas do menu com um Super Admin, registrando erros na tela e no console.
- Comparar cada número do Início com a lista que ele abre.
- Procurar links quebrados para endereços que não existem mais.
- Rodar a verificação de segurança do banco e os testes atuais.
- Corrigir os erros simples encontrados. Itens maiores ou ligados a regras de negócio entram numa lista para você aprovar antes de qualquer correção.

## Detalhes técnicos
- `Dashboard.tsx` GovernanceList/kpis: trocar os `to` por URLs com query (`?filtro=vencidos`, `?status=atrasada`, etc.).
- As páginas Terceiros, Revisões, Exceções, Licenças, SoD, Privilegiados e Colaboradores passam a ler `useSearchParams` e aplicar o filtro. Os critérios devem ser os mesmos da RPC de métricas do dashboard, conferidos na definição SQL para os números coincidirem.
- Teste: um teste por item garantindo que o critério da página filtra os mesmos registros que a métrica conta (ex.: contrato vencido = data_fim < hoje, ativo).
