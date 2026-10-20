# Analisar link ou documentação ao conectar um sistema

## O que você vai ter
Na conversa de "Conectar sistema" você pode:
- **Colar um link** (site do sistema, página da API, Swagger/OpenAPI, manual).
- **Anexar um arquivo** (PDF, Word, TXT, JSON/YAML de API).
- **Só explicar** em texto, como hoje.

O assistente lê o material e devolve um **diagnóstico** na conversa:
- **Melhor forma de conectar**: Login Microsoft/grupo, API ou manual, com o porquê.
- **Se for API**: endereço base, tipo de autenticação (token, usuário/senha, chave, OAuth), e as chamadas para criar, desativar e consultar usuário.
- **Perfis internos** encontrados (ex.: Leitor, Aprovador, Admin).
- **O que faltou** e o que ele ainda precisa perguntar.

Nada é gravado sozinho: aparece um cartão "Aplicar na ficha" com o que foi encontrado. Você confere e confirma; dá para aplicar só parte.

## Regras
- Credenciais nunca são lidas nem guardadas pela análise; se o documento tiver uma chave, ela é ignorada e você é avisado para colocá-la no campo protegido.
- Páginas que exigem login não podem ser lidas; o assistente avisa e pede o arquivo.
- Após aplicar, o fluxo segue igual: teste do Hermes, ligação aos perfis, "Salvar e ativar".

## Detalhes técnicos
- Leitura de links: conector Firecrawl (scrape em markdown, onlyMainContent), chamado só do backend; sem conector, fallback com fetch simples de HTML/JSON público. Vou abrir o cartão de conexão do Firecrawl na implementação.
- Arquivos: upload para bucket privado `app-docs`, extração de texto no backend (PDF/DOCX/TXT/JSON/YAML), limite ~10 MB.
- `app-connect-assistant`: nova ferramenta `analisar_material(url|arquivo)` que extrai com Lovable AI um JSON estruturado {modo_sugerido, motivo, api_base_url, auth_type, actions{create,disable,lookup}, perfis[], lacunas[]}; remove valores com cara de segredo antes de responder. Resultado salvo como mensagem da conversa.
- Front (`ConectarSistemaPage`): campo para anexar arquivo, detecção de URL na mensagem, cartão "Aplicar na ficha" com checkboxes por item; perfis aplicados via `aplicacao_perfis_internos`.
- Testes: filtro de segredos e mapeamento do diagnóstico para a ficha (incluindo `fichaPendencias`).
