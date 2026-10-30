Padronizar as demais telas no estilo do novo Início

Hoje cada tela tem o próprio jeito de mostrar topo, números e listas. A ideia é levar para todas o padrão do Início: título limpo, poucos números grandes que viram filtro, um gráfico só quando ajuda e listas com ícone, nome, descrição curta e situação colorida.

## Padrão comum (todas as telas)

```text
+--------------------------------------------------------------------+
| Colaboradores                                    [+ Novo]  [ ... ] |
| Pessoas da Órigo com conta corporativa                             |
|                                                                    |
| +-----------+ +-----------+ +-----------+ +-----------+            |
| | 1.777     | | 42        | | 13        | | 6         |            |
| | Ativos    | | Entraram  | | Saíram    | | Com erro  |  <- clicar |
| |  +3 sem.  | |  30 dias  | |  30 dias  | |  ver      |     filtra |
| +-----------+ +-----------+ +-----------+ +-----------+            |
|                                                                    |
| [Buscar...........]  [Situação v] [Área v]        Filtro: Ativos x |
| ------------------------------------------------------------------ |
| (foto) Ana Souza        Analista · Financeiro        (o) Ativo   > |
| (foto) Bruno Lima       Técnico · O&M                (o) Desligado >|
+--------------------------------------------------------------------+
```

- Topo: título + uma frase; botões principais à direita; nada de faixas técnicas.
- No máximo 4 cartões de número; cada um abre a lista filtrada (mesmo comportamento do Início).
- Lista em linhas com ícone/foto, duas linhas de texto e etiqueta de situação com cor (verde ativo, âmbar atenção, vermelho erro, cinza inativo).
- Estado vazio padrão com ícone e uma frase; carregamento com blocos cinza.

## Sugestões por tela

1. Fila (solicitações / JML)
```text
| Pendentes 12 | Em execução 3 | Concluídas hoje 28 | Falhas 1 |
| Linha do tempo: Criar conta -> Grupos -> Licença -> Concluído   |
| (H) Joiner · Ana Souza   aguardando Hermes há 4 min   [Âmbar]  |
```
Cada item mostra a etapa atual numa barrinha de progresso, não só um status texto.

2. Colaboradores / Terceiros / Contas de serviço — padrão acima; Terceiros ganha cartão "Revalidação vence em 15 dias"; Contas de serviço ganha "Sem dono".

3. Ficha da pessoa
```text
| (foto grande) Ana Souza          (o) Ativa     [Ações v]       |
| Analista · Financeiro · desde 03/2024                           |
| [Acessos] [Licenças] [Histórico] [Exceções]                     |
| Acessos: cartões por sistema com logo + perfil + origem (cargo) |
```

4. Licenças
```text
| (logo M365) Microsoft 365 E3      312 / 320  [====== ]  97%    |
| (logo Teams) Teams Premium  Suspensa         1 / 0   [!!]      |
```
Barra de uso com cor por ocupação; cartões: Total, Em uso, Livres, Acima do contratado.

5. Aplicações — grade de cartões (logo, nome, modo Grupo/API/Manual, dono, situação da conexão) em vez de tabela; cartão "Conectar sistema" como primeiro item.

6. Riscos (Privilegiados, SoD, Exceções) — cartões de número + lista ordenada por gravidade com faixa colorida à esquerda.

7. Revisões de acesso — cada campanha como cartão com progresso (revisados / total), revisor e prazo.

8. Auditoria — reaproveitar a Atividade recente do Início (ícone por ação + frase de negócio), agrupada por dia, com filtros por tipo.

9. Configurações — já reorganizada; só alinhar cartões e espaçamentos ao padrão.

## Ordem sugerida
1) Padrão comum + Colaboradores/Terceiros/Contas  2) Fila  3) Licenças e Aplicações  4) Riscos, Revisões, Auditoria  5) Ficha da pessoa.

## Técnico
- Criar componentes compartilhados `PageHeader`, `MetricCard` (clicável, aplica query param como em `dashboardFilters.ts`), `ListRow`, `StatusBadge` único e `ProgressBar`, usando só tokens do tema.
- Substituir os `StatCard` locais (11 telas) pelo `MetricCard`; sem mudança de dados nem regras, apenas apresentação.
