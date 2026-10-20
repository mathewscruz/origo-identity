/** Perfis do painel: platform_admin = Super Admin, operador = Suporte, viewer = Leitor ("admin" é alias legado). */
export type PainelRole = "platform_admin" | "admin" | "operador" | "viewer";
export const ROLE_LABEL: Record<string, string> = { platform_admin: "Super Admin", admin: "Super Admin", operador: "Suporte", viewer: "Leitor" };
export const isSuperAdmin = (r?: string | null) => r === "platform_admin" || r === "admin";
/** Operar pessoas/terceiros/grupos/licenças/desativações. */
export const canOperate = (r?: string | null) => isSuperAdmin(r) || r === "operador";
/** Configurações, usuários do painel, cargos, perfis de acesso, aplicações e exclusões. */
export const canConfigure = isSuperAdmin;
