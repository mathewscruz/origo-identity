import { useAuth } from "@/contexts/AuthContext";
import { canOperate, isSuperAdmin } from "@/lib/roles";

/** Pode operar o dia a dia (Super Admin ou Suporte). */
export function useCanEdit() {
  const { role } = useAuth();
  return canOperate(role);
}

/** Pode configurar o sistema (só Super Admin). */
export function useIsSuperAdmin() {
  const { role } = useAuth();
  return isSuperAdmin(role);
}
