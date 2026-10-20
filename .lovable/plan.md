# Validação das licenças do tenant

## O que encontrei
- O painel tem **49 licenças**. A última sincronização com a Microsoft foi em **15/10**, há 5 dias, então a lista pode estar desatualizada.
- **8 licenças estão sem nome comercial**: aparece o código técnico no lugar do nome. São elas: Copilot Business (2 variações), Visio Plano 2 (Departamentos), Power Apps por usuário, Information Protection Compliance, Customer Insights, Customer Insights Journeys T3 e Customer Service Pro Attach.
- **2 licenças estão com mais uso do que o comprado** (ex.: Teams Premium suspenso com 1 em uso e total 0). Isso vem da Microsoft, não é erro do painel.
- A sincronização já remove do painel as licenças que saíram do tenant e soma as unidades em período de carência.

## O que vou fazer
1. **Nomes comerciais completos:** em vez de depender de uma lista fixa, o sincronizador passa a usar também a tabela oficial de nomes da Microsoft. Assim, qualquer licença nova chega com o nome correto. Se a tabela não puder ser lida, vale a lista atual, que também vai receber as 8 que faltam.
2. **Sincronização nova pelo Hermes:** peço uma atualização ao Hermes e comparo o resultado com o que a Microsoft retornou: quantidade de licenças, quais entraram, quais saíram e totais de uso.
3. **Indicação na tela de Licenças:** "Suspensa" e "Uso acima do contratado" ficam destacadas, e os nomes técnicos só aparecem como detalhe.
4. **Relatório final:** entrego a lista completa (nome comercial, código, total, em uso, situação) e aponto qualquer divergência.

## Detalhes técnicos
- `_shared/m365SkuNames.ts`: novo `resolveFriendlyNames(parts)`. Ele baixa o CSV oficial "Product names and service plan identifiers" (download.microsoft.com), monta um mapa `String_Id → Product_Display_Name` em memória por execução e usa `M365_SKU_FRIENDLY` como fallback. As 8 entradas faltantes também vão para `M365_SKU_FRIENDLY`.
- `sync-entra-licencas`: usar o resolver; redeploy. Também deixar de reinserir um alerta "crítico" a cada execução, verificando antes se já existe um alerta não lido para o mesmo SKU.
- Disparar com `agent_refresh_request('sync-entra-licencas')` e validar `entra_licencas.updated_at` depois da execução. Se o Hermes não rodar, chamo a função diretamente uma única vez para validar.
- `LicencasPage`: badges de suspensa e excedente.
