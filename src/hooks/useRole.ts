import { useAuth } from "@/contexts/AuthContext";

/** Returns true if user can create/edit/delete */
export function useCanEdit() {
  const { role } = useAuth();
  return role === "admin" || role === "operador";
}

/** Returns true if user is admin */
export function useIsAdmin() {
  const { role } = useAuth();
  return role === "admin";
}
