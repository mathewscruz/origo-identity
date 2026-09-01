import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import logoImg from "@/assets/logo.png";
import PageTransition from "@/components/PageTransition";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import ForcePasswordChangeDialog from "@/components/ForcePasswordChangeDialog";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

export default function PortalLayout() {
  useRealtimeSync();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [mustChangePwd, setMustChangePwd] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/portal/login", { replace: true });
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/portal/login", { replace: true });
      } else {
        const { data: p } = await supabase.from("profiles").select("must_change_password").eq("id", session.user.id).maybeSingle();
        setMustChangePwd(!!(p as any)?.must_change_password);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!user) return null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada com sucesso");
    setLogoutOpen(false);
    navigate("/portal/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Órigo" className="h-8 w-8 rounded-lg" />
            <span className="text-lg font-semibold">Portal de Solicitações</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLogoutOpen(true)}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair do portal</AlertDialogTitle>
            <AlertDialogDescription>Deseja realmente encerrar sua sessão?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>Sair</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ForcePasswordChangeDialog open={mustChangePwd} onComplete={() => setMustChangePwd(false)} />
    </div>
  );
}
