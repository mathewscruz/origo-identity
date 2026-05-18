# Documentação do Sistema — Órigo Access & Identity

Gerar um documento Word (.docx) único, nível funcional + técnico, para público misto (TI/Segurança, Auditoria e Devs), entregue em `/mnt/documents/origo-access-identity-documentacao.docx`.

## Estrutura do documento (~20 páginas)

**1. Visão geral**
- O que é o sistema (IGA — Identity Governance & Administration para JML)
- Objetivos: governança de identidades, automação Joiner/Mover/Leaver, redução de riscos de acesso indevido
- Personas: Operador TI, Aprovador, Gestor, Auditor, Colaborador (Portal)

**2. Arquitetura**
- Frontend React + Vite + Tailwind, hospedado em Lovable
- Backend Lovable Cloud (Postgres + Edge Functions + Storage + Auth)
- Execução híbrida: Entra ID (cloud) via `process-iam-queue` e AD on-prem via `iam-agent-api` (PowerShell)
- Diagrama ASCII de fluxo de dados
- Modos: Simulação vs Produção

**3. Fontes de dados (de onde vêm)**
- CSV de colaboradores RH → `sync-csv-colab` (chave: `employID`, hash SHA-256 incremental)
- Microsoft Graph API: usuários, grupos, licenças, apps, papéis privilegiados, SharePoint
- Entradas manuais via UI: terceiros, exceções, perfis, regras
- Portal de auto-serviço: solicitações de acesso, revisões externas

**4. Modelo de dados (principais tabelas)**
- `colaboradores`, `terceiros`, `cargos`, `areas`, `empresas`, `localidades`
- `perfis_acesso` + `perfil_aplicacoes` / `perfil_grupos` / `perfil_licencas` / `perfil_sharepoint`
- `cargo_perfis`, `perfil_atribuicoes`
- `eventos_jml`, `iam_queue`, `excecoes`, `revisoes`, `auditoria`, `alertas`
- `entra_grupos`, `entra_licencas`, `entra_roles`, `aplicacoes`
- Tabela resumo coluna a coluna das mais críticas

**5. Lógica de provisionamento**
- Cargo → Perfis → Recursos (grupos AD/Entra, licenças, apps, pastas SharePoint)
- Provisionamento **aditivo** em mudanças de perfil/cargo
- Revogação **apenas** no fluxo Leaver
- Geração de identidade: `nome.sobrenome@origoenergia.com.br`, senha padrão `Origo@2026er`, `changePasswordAtLogon`
- Fila `iam_queue`: payload camelCase, retry exponencial, lote de 50

**6. Fluxos JML (Joiner / Mover / Leaver)**
- Joiner: criação no AD primeiro, depois Entra; atribuição via cargo
- Mover: diff aditivo, sem remoções
- Leaver: Hard Disable (cloud) vs Soft Disable, revogação de todos os recursos
- Diagrama por fluxo

**7. Módulos da aplicação (o que cria/faz)**
- Colaboradores e Terceiros (45 dias de revalidação)
- Perfis de Acesso e Catálogo
- Fila de Provisionamento (visão unificada)
- Solicitações e Aprovações (item-a-item, `solicitacao_itens`)
- Revisões de Acesso (portal externo via UUID token)
- Privilegiados (PAM via Directory Roles)
- SoD (segregação de funções), Matriz, Exceções
- Auditoria, Alertas, Relatórios, Dashboard
- Configurações (Empresas, Áreas, Cargos, Localidades, Parâmetros, Integrações)

**8. Integrações**
- Microsoft Graph (Entra ID, SharePoint) — escopos necessários
- Active Directory on-prem via `iam-agent-api` + token `IAM_AGENT_TOKEN`
- SendGrid para e-mails (JML, alertas, revisões)
- Lista de Edge Functions e o que cada uma faz

**9. Segurança e governança**
- Autenticação obrigatória, self-registration desabilitado
- RBAC: `admin`, `operador`, `aprovador`, leitura
- RLS estrito (sem escrita anônima), Security Definer functions
- HIBP enabled, auditoria centralizada em `auditLogger.ts`

**10. Operação**
- Syncs manuais (crons desabilitados)
- Modo Simulação para dry-run
- Tratamento de erros e retry
- Troubleshooting comum (Graph 403, grupos on-prem, quarentena de colaboradores)

**11. Glossário** (JML, IGA, SoD, PAM, Entra ID, etc.)

## Implementação técnica

- Usar skill `docx` com `docx-js`
- Página US Letter, margens 1", fonte Arial, estilos Heading1-3 com cor primária Teal (#16968D)
- Tabelas com larguras DXA explícitas
- Listas com `LevelFormat.BULLET`
- Cabeçalho com título, rodapé com numeração
- TOC opcional no início
- Após gerar: validar via `validate_document.py`, converter para PDF preview e inspecionar 2-3 páginas para QA visual
- Entrega final apenas o `.docx` em `/mnt/documents/`

## Fontes de informação

- Memórias do projeto (`mem://project/overview`, `mem://architecture/*`, `mem://features/*`)
- Schema do banco já disponível no contexto
- Estrutura de pastas `src/pages/*` e `supabase/functions/*`
- Não vou alterar nenhum código-fonte
