

## Plano: Importar todas as 3874 linhas sem exceção

### Diagnóstico

O sistema tem **3833** registros no banco, mas o CSV tem **3874** linhas. A causa raiz é dupla:

1. **Deduplicação no código**: O Map consolida 91 matriculas duplicadas, reduzindo para 3783 únicos processados
2. **50 duplicatas residuais no banco**: De imports anteriores, 50 matriculas aparecem 2x (50 registros extras)
3. Resultado: 3783 + 50 extras = 3833 (não bate com 3874)

O usuário confirmou que quer **todas as linhas** do CSV como registros separados, mesmo com employID repetido.

### Solução: Delete-all + Re-insert

A abordagem mais limpa e confiável: a cada importação, **apagar todos os registros `origem='csv'`** e **re-inserir todas as linhas do CSV**. Isso garante paridade exata 1:1 entre CSV e banco.

Isso é seguro porque:
- As tabelas `eventos_jml`, `perfil_atribuicoes`, `excecoes`, `revisao_itens` **não têm FK** para `colaboradores`
- O único FK é `gestor_id` (self-ref) com `ON DELETE SET NULL`

### Alterações

**1. `supabase/functions/sync-csv-colab/index.ts`**

Simplificar `processCsvData()`:

- **Remover** toda a lógica de deduplicação (Map dedupMap)
- **Remover** lógica de classificação (new/changed/unchanged)
- **Remover** lógica de hash comparison
- **Novo fluxo**:
  1. Parse CSV → 3874 rows
  2. Snapshot: contar registros existentes com `origem='csv'` para log
  3. Registrar eventos JML (leavers para matriculas que existiam e sumiram, joiners para novas)
  4. `DELETE FROM colaboradores WHERE origem = 'csv'` (batch por IDs)
  5. `INSERT` todas as 3874 linhas em batches de 500
  6. Finalizar sync_job com contagens exatas

- Para eventos JML: comparar set de matriculas antes/depois (usando contagem, não hash)

**2. `supabase/functions/sync-sharepoint-csv/index.ts`**

Mesma lógica (delete-all + re-insert).

**3. `src/pages/configuracoes/IntegracoesPage.tsx`**

- Trocar label "quarentena" por "removidos" no painel de progresso
- Exibir contagem correta

### Resultado esperado

Após importação: **exatamente 3874** registros no banco, correspondendo 1:1 com o CSV. Sem lógica de dedup, sem sufixos, sem divergência.

### Arquivos afetados

| Ação | Arquivo |
|---|---|
| Reescrever lógica | `supabase/functions/sync-csv-colab/index.ts` |
| Reescrever lógica | `supabase/functions/sync-sharepoint-csv/index.ts` |
| Ajustar labels | `src/pages/configuracoes/IntegracoesPage.tsx` |

