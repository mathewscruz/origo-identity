# Configurações: visual mais limpo e funções enxutas

Hoje são 8 abas (Parâmetros, Hermes Agent, Integrações, Usuários, Cargos, Áreas, Empresas, Localidades). Há informações repetidas, termos técnicos e telas quase iguais.

## Nova organização (de 8 para 5 abas)

```text
Geral            -> regras do sistema (antigos Parâmetros)
Hermes e conexões-> Hermes Agent + Integrações, numa tela só
Usuários do painel
Cargos
Estrutura        -> Áreas, Empresas e Localidades em abas internas
```

Os endereços antigos continuam funcionando e levam para a aba nova.

## Retirar
- **Cartão duplicado do agente** em Integrações: o mesmo status já aparece em Hermes Agent. Fica só um.
- **Termos técnicos** nas descrições ("iam-agent-api", "host:/sites/nome (Graph)", "UPN", "dry-run", "REST/SCIM", "UTC"): troca por frases simples.
- **Rodapé "Última sincronização de roles privilegiadas"** em Parâmetros: informação solta, sem ação.
- **Lista antiga de rotinas** que ainda cita a reconciliação proibida: não aparece na tela, mas sobrou no código. Sai.

## Ajustar
- **Geral:** dividido em 3 blocos recolhíveis (Aprovação, Base do RH, Governança periódica). Cada campo mostra rótulo, valor e uma ajuda curta. Domínios de e-mail e SharePoint ficam juntos num bloco "Identidade e e-mail". O botão "Salvar" aparece fixo só quando há alteração, junto com "Descartar".
- **Hermes e conexões:** no topo, uma faixa com status, versão e último contato. Abaixo, Rotinas e Pedidos recentes. Por último, os catálogos: Grupos do Entra, Sites do SharePoint e Conectores, com contagem e "atualizado há X".
- **Estrutura:** uma tabela padrão para Áreas, Empresas e Localidades, com busca, botão "Novo", edição em janela lateral e confirmação para excluir. Cada item mostra quantas pessoas usam o cadastro e bloqueia a exclusão quando ele está em uso.
- **Visual:** o menu interno passa a usar o mesmo estilo dos itens ativos do menu lateral (fundo suave e barra teal). Cada tela ganha título e subtítulo, e cartões, espaçamentos e estados vazios ficam padronizados.

## Incluir
- **Histórico de alterações** em Geral: as últimas 10 mudanças de parâmetros, com quem mudou, o valor de antes e o de depois. Esses dados já são gravados na auditoria.
- **Aviso de configuração faltando:** quando falta um parâmetro essencial (domínio de e-mail, site do SharePoint), aparece um selo na aba e um aviso no topo.

## Detalhes técnicos
- `ConfiguracoesLayout.tsx`: nova `ALL_NAV` com 5 itens; rotas antigas (`/parametros`, `/agente`, `/integracoes`, `/areas`, `/empresas`, `/localidades`) com `Navigate` para as novas.
- Novo `EstruturaPage.tsx` com abas reutilizando a lógica de CRUD atual. Novo `HermesConexoesPage.tsx` compondo o conteúdo de AgentePage e de IntegracoesPage, sem o cartão duplicado.
- `ParametrosPage.tsx`: remover `CRON` e o rodapé; adicionar Accordion, Descartar e histórico (`auditoria` com `acao='salvar_parametros'`).
- Contagem de uso por cadastro via consulta em `colaboradores` (`area_id`, `empresa_id`, `localidade_id`), conferindo os nomes das colunas antes.
- Sem mudança de banco nem de permissões; Configurações continua exclusivo do Super Admin.
