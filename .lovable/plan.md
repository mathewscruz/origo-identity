# Acentos quebrados, ícones das aplicações e tabelas de usuários

## 1. Corrigir textos com símbolo no lugar do acento (ex.: "S�o Paulo")
Situação no banco hoje: 6 locais, 78 cargos e 36 nomes de colaboradores aparecem com "�" no lugar do acento. Áreas e empresas estão corretas.
- **Locais e cargos:** quando existe uma versão correta do mesmo nome (ex.: "São Paulo" ao lado de "S�o Paulo"), as pessoas passam para a versão correta e a versão com símbolo é apagada. Se houver mais de uma versão correta possível, nada é alterado e o caso vai para uma lista de revisão.
- **Nomes de colaboradores:** o nome correto é recuperado das cópias anteriores da mesma pessoa, guardadas no sistema. Nenhuma letra é adivinhada. O que não tiver cópia correta continua igual e entra na mesma lista.
- **Proteção para não voltar:** a leitura da base do RH não pode mais criar local ou cargo com "�".
- Antes de alterar qualquer coisa, salvo uma cópia de segurança.

## 2. Ícone certo para cada sistema em Aplicações
Hoje 15 dos 16 sistemas não têm endereço cadastrado, por isso aparece o globo genérico.
- **Sistemas de mercado:** cada um ganha o ícone oficial da sua marca (Azure, Azure DevOps, Dynamics, Power BI, Databricks, Grafana, GLPI, VExpenses, Projuris, Splitc, VPN).
- **Sistemas internos** (Academia Órigo, Aster, Atlas, CMS, V360): quadradinho teal com as iniciais.
- O ícone também aparece na ficha do sistema, no catálogo e nos Perfis de Acesso.

## 3. Tabelas de Colaboradores, Terceiros e Contas de serviço
**Visual**
- As três tabelas seguem o mesmo padrão: iniciais e nome em destaque, e-mail embaixo em cinza, situação em etiqueta colorida e linhas mais compactas.
- O cabeçalho da tabela fica fixo ao rolar.
- Colunas de pouco uso (origem, login AD) ficam ocultas por padrão, com opção para mostrar.
- Terceiros: nova coluna "Revalidação" com um mini-anel colorido, usando a mesma regra da ficha (vermelho se vencida, amarelo com 15 dias ou menos, verde acima disso).
- Contas de serviço: coluna "Dono" em destaque, com um aviso quando a conta estiver sem dono.
- Ao entrar, aparecem linhas de esqueleto em vez de tela vazia.

**Velocidade**
- A lista passa a buscar só as colunas que a tabela mostra, em vez do cadastro completo de quase 4 mil pessoas.
- Só as linhas visíveis na tela são desenhadas.
- A lista fica guardada ao trocar de página, sem recarregar tudo.
- A busca espera você terminar de digitar antes de filtrar.

## Detalhes técnicos
- Script de correção: `iam_change_backups` / `activity_name_references` para os nomes. Para cargos e locais, o critério é: o nome com "�" vira um padrão em que o "�" casa com exatamente uma letra, e só há troca se existir uma única linha limpa que case.
- Guarda em `_shared/csvColabSync.ts` contra U+FFFD em nomes de cargo e local, com teste.
- Mapa de marcas em `src/lib/appBrands.ts` (nome → ícone SVG oficial ou domínio). `AppIcon` passa a receber `nome`, com fallback de iniciais. Teste do mapeamento.
- Novo hook `useColaboradoresLista` com select enxuto e `staleTime` de 5 minutos; virtualização com `@tanstack/react-virtual`; busca com espera de 250 ms.
- Componente `IdentityTable` compartilhado pelas três telas.
- Tempo de carregamento medido via Playwright antes e depois.
