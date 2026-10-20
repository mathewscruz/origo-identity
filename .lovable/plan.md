# Cartões de status do Início: retirar e trocar por uma linha discreta

## Avaliação
- **Agente executor:** o menu lateral já mostra "Agente online" o tempo todo, então o cartão repete essa informação. Só importa quando o agente fica sem sinal.
- **Base do RH:** é útil, mas só quando está atrasada ou falhou. No dia a dia ("0 novos · 20 alt.") não exige ação.
- **Aprovação (direta):** é uma configuração e não muda no dia a dia. O lugar dela é em Configurações > Parâmetros, não no Início.

## O que muda
- Saem os três cartões.
- Abaixo do título do Início entra uma linha pequena e cinza, por exemplo: "Hermes online há 2 s · Base do RH atualizada há 1 h (20 alterações)". Cada parte da linha é um link para a página correspondente.
- A linha só ganha cor quando há problema, com um ponto de aviso:
  - Hermes sem sinal há mais de 10 min.
  - Base do RH com falha ou sem atualização há mais de 26 h.
- O modo de aprovação aparece só em Configurações.

## Detalhes técnicos
- `Dashboard.tsx`: remover o array e o grid dos cartões de status (linhas ~155–185 e o render correspondente). Criar um `StatusLine` com `text-xs text-muted-foreground`, usando `text-warning` ou `text-destructive` só em problema. Os dados (`agent`, `ultimo_csv`) continuam vindo de `dashboard_metrics`.
- Remover os imports que ficarem sem uso, como `Bot`, `FileSpreadsheet`, `ShieldCheck`, `ShieldAlert` e `useParametro`, se não forem usados em outro lugar do arquivo.
