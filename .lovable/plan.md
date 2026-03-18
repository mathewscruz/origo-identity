

## Plano: Icone de atividade/provisionamento ao lado do nome do colaborador

### Conceito

Adicionar um icone (ex: `Activity` ou `Loader`) ao lado do nome de cada colaborador na tabela. Ao clicar, abre um Popover mostrando o historico de acoes realizadas para aquele colaborador — eventos JML (joiner/mover/leaver), acessos provisionados e status no Entra ID.

### Mudancas

#### 1. `ColaboradoresPage.tsx` — icone + popover na coluna Nome

- Importar `Popover`, `PopoverTrigger`, `PopoverContent` e icone `Activity` do lucide
- Ao lado do `<Link>` do nome, adicionar um botao com icone `Activity`
- Ao clicar, o Popover faz duas queries rapidas:
  - `eventos_jml` filtrado por `colaborador_id` (ultimos 10, ordenados por `created_at desc`) — mostra tipo (joiner/mover/leaver), status, data
  - `perfil_atribuicoes` filtrado por `colaborador_id` com join em `perfis_acesso` — mostra perfis atribuidos e se estao ativos
- Exibir uma mini-timeline dentro do Popover com icones coloridos por tipo:
  - Joiner: icone verde
  - Mover: icone azul
  - Leaver: icone vermelho
  - Acessos provisionados: lista com badges ativo/revogado

#### 2. Componente interno `ColaboradorActivityPopover`

Criar como componente inline no mesmo arquivo (ou extrair se preferir) que:
- Recebe `colaboradorId` e `colaboradorNome`
- Usa `useState` para carregar dados sob demanda (lazy load ao abrir o popover)
- Mostra skeleton enquanto carrega
- Mostra "Nenhuma atividade registrada" se vazio

### Arquivos afetados

| Acao | Arquivo |
|---|---|
| Editar | `src/pages/colaboradores/ColaboradoresPage.tsx` |

