import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: { nome: string; email: string; ativo: boolean; avatar_url?: string | null; must_change_password?: boolean } | null;
  role: string | null;
  mustChangePassword: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, loading: true, profile: null, role: null, mustChangePassword: false, signOut: async () => {}, refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/** papel efetivo = o mais alto entre os atribuídos (platform_admin ⊇ admin ⊇ operador ⊇ viewer) */
const ROLE_ORDER = ["platform_admin", "admin", "operador", "viewer"];
function highestRole(roles: string[]): string {
  return ROLE_ORDER.find((r) => roles.includes(r)) ?? "viewer";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profile, setProfile] = useState<any>(null);
  const [role, setRole] = useState<string | null>(null);
  const signingOut = useRef(false);

  // conta desativada pelo administrador: encerra a sessão na hora
  const forceSignOut = useCallback(async (motivo: string) => {
    if (signingOut.current) return;
    signingOut.current = true;
    await supabase.auth.signOut();
    toast.error("Sessão encerrada", { description: motivo, duration: 8000 });
    signingOut.current = false;
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data: p } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (p && p.ativo === false) { await forceSignOut("Sua conta foi desativada. Fale com o administrador do painel."); return; }
      setProfile(p);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: roles } = await (supabase as any).from("user_roles").select("role").eq("user_id", userId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRole(highestRole(((roles ?? []) as any[]).map((r) => r.role)));
    } catch {
      setRole("viewer");
    }
    setLoading(false);
  }, [forceSignOut]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => fetchProfile(session.user.id), 0);
      } else {
        setProfile(null);
        setRole(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // tempo real no próprio perfil/papel: desativação derruba a sessão; troca de papel reflete sem F5
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`auth-profile-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = payload.new as any;
        if (row?.ativo === false) { void forceSignOut("Sua conta foi desativada por um administrador."); return; }
        setProfile(row);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` }, () => { void fetchProfile(user.id); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, fetchProfile, forceSignOut]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, profile, role, mustChangePassword: !!profile?.must_change_password, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
