

## Plano: Corrigir erro ao limpar base de colaboradores

### Problema

A funcao `handleCleanBase` nao limpa todas as tabelas que referenciam `colaborador_id`. As tabelas `excecoes` e `revisao_itens` possuem foreign keys para `colaboradores` com `ON DELETE SET NULL`, mas pode haver constraints ou erros nao tratados. Alem disso, o operador `.in()` do Supabase tem limite de URL quando ha muitos IDs.

### Solucao

#### 1. Adicionar limpeza das tabelas faltantes

Antes de deletar colaboradores, limpar tambem:
- `excecoes` (tem `colaborador_id` referenciando colaboradores)
- `revisao_itens` (tem `colaborador_id` referenciando colaboradores)

#### 2. Processar em lotes para evitar limite de URL

Dividir os IDs em lotes de 200 para evitar que o `.in()` ultrapasse o limite de tamanho da URL do PostgREST.

#### 3. Tratar erros individuais por tabela

Capturar e logar erros de cada delete para identificar qual tabela causa o problema.

### Arquivo afetado

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/configuracoes/IntegracoesPage.tsx` |

### Codigo da correcao

```typescript
const handleCleanBase = useCallback(async () => {
  setCleaning(true);
  try {
    const { data: operadores } = await supabase.from("operadores").select("email");
    const protectedEmails = new Set((operadores || []).map((o: any) => o.email?.toLowerCase()));
    const { data: toClean } = await supabase.from("colaboradores").select("id, email");
    const safeToClean = (toClean || []).filter((c: any) => !c.email || !protectedEmails.has(c.email.toLowerCase()));
    if (safeToClean.length === 0) { toast({ title: "Nada a limpar" }); setCleaning(false); return; }
    const ids = safeToClean.map((c: any) => c.id);

    // Processar em lotes de 200
    const BATCH = 200;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      await supabase.from("perfil_atribuicoes").delete().in("colaborador_id", batch);
      await supabase.from("eventos_jml").delete().in("colaborador_id", batch);
      await supabase.from("iam_queue").delete().in("colaborador_id", batch);
      await supabase.from("colab_quarentena").delete().in("colaborador_id", batch);
      await supabase.from("excecoes").delete().in("colaborador_id", batch);
      await supabase.from("revisao_itens").delete().in("colaborador_id", batch);
      const { error } = await supabase.from("colaboradores").delete().in("id", batch);
      if (error) throw error;
    }
    toast({ title: "Base limpa", description: `${ids.length} colaborador(es) excluídos.` });
  } catch (err: unknown) {
    toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
  }
  setCleaning(false);
}, [toast]);
```

