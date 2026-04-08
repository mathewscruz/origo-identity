import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, role } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  // Only admin and operador can access admin panel; viewers go to portal
  if (role && !["admin", "operador"].includes(role)) {
    return <Navigate to="/portal" replace />;
  }
  return <>{children}</>;
}
