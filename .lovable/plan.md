

# Plano: Consolidar Especificação Funcional do Órigo Identity

Vou criar o documento mestre `.lovable/plan.md` unificando toda a arquitetura funcional (v3) com a especificação de telas (v1) em um único documento consolidado, sem redundâncias.

## O que será feito

Criar o arquivo `.lovable/plan.md` com o título **"Órigo Identity — Especificação Funcional Consolidada"**, seguindo exatamente a estrutura de 11 seções solicitada:

1. **Visão Geral do Produto** — objetivo, contexto 2Easy/Entra ID, princípios, escopo
2. **Perfis do Sistema** — 5 perfis com tabela de permissões consolidada
3. **Arquitetura Funcional** — 14 módulos, separação pessoa vs operador, conceitos-chave
4. **Modelo de Dados Funcional** — entidades agrupadas por domínio (identidade, governança, JML, licenças, auditoria) com relacionamentos
5. **Regras de Negócio** — importação/diff, JML, quarentena, motor de regras, sensibilidade, aprovações, terceiros, licenças, exceções, revisões, alertas, auditoria, idempotência
6. **Fluxos Operacionais** — 8 fluxos em formato textual sequencial
7. **Especificação de Telas** — 14 módulos com objetivo, blocos, filtros, tabelas/colunas, ações, modais/drawers, estados, permissões, rotas
8. **Estrutura Global de Navegação** — layout, sidebar groups, header, breadcrumbs, rotas completas
9. **Padrões Globais de UX** — loading, erro, sucesso, confirmação, paginação, responsividade
10. **Fases de Implementação** — 5 fases com escopo claro
11. **Pontos Críticos** — riscos, cuidados, dependências

## Abordagem

- Fonte primária: conversas anteriores (arquitetura v3 + especificação de telas v1)
- Onde houver sobreposição, fundir em uma única seção (ex: entidades aparecem uma vez no modelo de dados, referenciadas nas telas)
- Nomes consistentes entre módulos, rotas, entidades e telas
- Linguagem corporativa, objetiva, sem emojis
- Documento extenso mas bem estruturado, pronto para guiar implementação

## Arquivo criado

- `.lovable/plan.md` — documento mestre completo (~2500-3000 linhas)

