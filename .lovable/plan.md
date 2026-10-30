Alinhamento da linha de status e ícones originais das licenças

1. Linha de status do Início (anexo 1)
- "Hermes online", "Base do RH" e "Atualizado há X" ficam na mesma altura, com o mesmo tamanho de letra e separados pelo mesmo ponto "·".
- Técnico: remover o `-mt-2` do `SystemStrip` em `Dashboard.tsx` e colocar `AutoUpdatedHint` dentro da mesma linha flex com separador.

2. Ícones originais nas licenças (anexo 2)
- Trocar os desenhos simplificados pelos ícones oficiais da Microsoft: Microsoft 365, Teams, Exchange, Outlook, Word/Excel/PowerPoint quando aparecerem no nome, Power BI, Power Apps, Power Automate, Dynamics 365, Copilot, Project, Visio, Entra ID, Defender, Windows, Intune.
- Fonte: pacote oficial de ícones de marca da Microsoft (Fluent UI brand icons, CDN do Office). Os arquivos são baixados uma vez e guardados no armazenamento de arquivos do app, sem depender de site externo em tempo real.
- Licenças sem produto reconhecido continuam com o ícone neutro atual.
- Técnico: `ProductLogo.tsx` passa a mapear o nome comercial para um `.asset.json` (Power BI/Apps/Automate separados de "power"), renderizando `<img>` 32x32; quando algum ícone oficial não for encontrado no pacote, mantém o SVG atual para aquele produto e eu aviso qual ficou.
