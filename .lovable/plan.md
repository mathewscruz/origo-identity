

# Plano: Corrigir timeout na sincronizacao SharePoint e garantir sites completos

## Problema
A funcao encontra 4.594 sites mas tenta processar todos sequencialmente (upsert + listar drives + listar pastas L1 + listar pastas L2 para cada site). Isso ultrapassa o timeout de ~60s das Edge Functions, resultando em "Failed to fetch".

## Solucao

### 1. Processar em lotes com retorno parcial (Edge Function)
Reescrever `sync-sharepoint-sites` para funcionar em duas fases:
- **Fase 1 (sem parametro)**: Busca todos os sites via Graph API e faz upsert apenas dos sites na tabela `sharepoint_sites`. Isso e rapido (apenas upserts, sem navegar drives/pastas). Retorna contagem.
- **Fase 2 (com `site_db_id`)**: Recebe um site especifico, lista seus drives e pastas (2 niveis) e faz upsert em `sharepoint_pastas`. Chamado sob demanda quando o usuario seleciona um site no perfil de acesso.

Isso resolve o timeout porque a fase 1 processa apenas upserts simples (rapido mesmo com 4.594 sites) e a fase 2 foca em um site por vez.

### 2. Batch upsert dos sites (performance)
Em vez de upsert um a um, agrupar em lotes de 500 para reduzir round-trips ao banco.

### 3. Sincronizacao de pastas sob demanda no frontend
Quando o usuario seleciona um site no formulario de perfil SharePoint, se as pastas desse site ainda nao foram carregadas, disparar automaticamente a fase 2 para aquele site.

### 4. Frontend: melhorar tratamento de erro
Adicionar timeout mais longo no fetch e tratar erro de rede adequadamente.

## Arquivos impactados
| Arquivo | Alteracao |
|---|---|
| `supabase/functions/sync-sharepoint-sites/index.ts` | Reescrever com processamento em 2 fases + batch upsert |
| `src/pages/configuracoes/IntegracoesPage.tsx` | Tratar timeout + feedback melhor |
| `src/pages/perfis-acesso/PerfilAcessoDetalhePage.tsx` | Sync pastas sob demanda ao selecionar site |
| `src/pages/perfis-acesso/PerfisAcessoPage.tsx` | Mesmo ajuste de sync sob demanda |

## Resultado esperado
- Botao "Sincronizar Sites do SharePoint" importa todos os 4.594 sites rapidamente (sem pastas)
- Ao selecionar um site no perfil de acesso, as pastas sao carregadas sob demanda
- O site "Seguranca da Informacao" e todos os demais aparecem disponiveis para selecao

