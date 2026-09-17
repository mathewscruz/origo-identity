import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, role } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  // admin / platform_admin / operador operam; viewer só lê (políticas de SELECT no banco)
  if (role && !["admin", "platform_admin", "operador", "viewer"].includes(role)) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
