Ajustes no topo do Início

- Título: "Governança de Identidades" passa a ser "Olá, {primeiro nome}" (ex.: "Olá, Mathews"; sem nome, apenas "Olá").
- Subtítulo: "Visibilidade. Controle. Conformidade." passa a ser "Governança de Identidades".
- Remover o bloco com foto, nome e perfil (Mathews Cruz · Super Admin) do canto do Início.

Técnico: em `src/pages/Dashboard.tsx`, usar `profile.nome.split(" ")[0]` via `useAuth`, trocar textos nas linhas 285-286 e remover `UserChip` (componente e uso, e `ROLE_NAME`/imports que ficarem sem uso).
