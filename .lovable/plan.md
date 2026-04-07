

## Plano: Exibir ícones/logos das aplicações

### Abordagem

Para apps com URL preenchida, usar o serviço gratuito Google Favicon para buscar o ícone do domínio automaticamente: `https://www.google.com/s2/favicons?domain=DOMINIO&sz=32`. Para apps Azure sem URL, usar o ícone genérico Cloud. Para apps manuais sem URL, usar o ícone Globe.

Isso evita a necessidade de armazenar imagens no banco ou fazer chamadas extras à Graph API (que exigiria permissões adicionais para buscar logos de Service Principals).

### Implementação

**Componente auxiliar `AppIcon`** — Recebe `url` e `origem`, renderiza:
- Se `url` preenchida: `<img>` com favicon do Google + fallback para ícone genérico em caso de erro
- Se Azure sem URL: ícone Cloud
- Se manual sem URL: ícone Globe

**Onde usar:**
- Na coluna "Nome" da tabela em `AplicacoesPage.tsx` — ícone pequeno (20px) ao lado do nome
- No header de `AplicacaoDetalhePage.tsx` — ícone maior (32px) ao lado do título

### Detalhes técnicos

```text
URL preenchida (ex: https://app.exemplo.com)
  → https://www.google.com/s2/favicons?domain=app.exemplo.com&sz=32
  → <img> com onError fallback para <Globe />

Sem URL + origem "azure"  → <Cloud />
Sem URL + origem "manual" → <Globe />
```

### Arquivos

| Ação | Arquivo |
|---|---|
| Editar | `src/pages/aplicacoes/AplicacoesPage.tsx` — adicionar ícone na coluna Nome |
| Editar | `src/pages/aplicacoes/AplicacaoDetalhePage.tsx` — adicionar ícone no header |

