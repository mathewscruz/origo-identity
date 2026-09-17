import { useAuth } from "@/contexts/AuthContext";

/** Pode criar/editar/operar (admin, platform_admin ou operador). */
export function useCanEdit() {
  const { role } = useAuth();
  return role === "admin" || role === "platform_admin" || role === "operador";
}
