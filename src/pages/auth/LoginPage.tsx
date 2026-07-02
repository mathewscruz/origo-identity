import { useState, useEffect } from "react";
import logoImg from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Shield } from "lucide-react";

// Only accept same-origin relative paths for `next` — never absolute URLs.
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextPath = safeNext(params.get("next"));
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate(nextPath, { replace: true });
  }, [user, navigate, nextPath]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast({ title: "Erro no login", description: error.message, variant: "destructive" });
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email enviado", description: "Verifique sua caixa de entrada para redefinir a senha." });
      setMode("login");
    }
    setLoading(false);
  };

  const titles = { login: "Entrar", forgot: "Redefinir Senha" };
  const descs = { login: "Insira suas credenciais para acessar o sistema", forgot: "Informe seu email para receber o link" };

  return (
    <div className="flex min-h-screen">
      {/* Left side — brand panel */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/70">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.3),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,hsl(var(--primary)/0.2),transparent_50%)]" />
        <div className="relative z-10 text-center space-y-8 px-12 max-w-lg">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20">
            <img src={logoImg} alt="Órigo" className="h-12 w-12 rounded-lg" />
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-white tracking-tight">Órigo Access & Identity</h1>
            <p className="text-lg text-white/80">Gestão de Identidades e Acessos</p>
          </div>
          <div className="flex flex-col gap-4 text-left">
            {[
              { icon: Shield, text: "Controle centralizado de identidades" },
              { icon: Shield, text: "Provisionamento automático de acessos" },
              { icon: Shield, text: "Governança e conformidade integradas" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-white/90">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <item.icon className="h-4 w-4" />
                </div>
                <span className="text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side — form */}
      <div className="flex w-full lg:w-1/2 xl:w-[45%] items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md border-0 shadow-none lg:border lg:shadow-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 lg:hidden">
              <img src={logoImg} alt="Access & Identity" className="h-12 w-12 rounded-lg" />
            </div>
            <CardTitle className="text-xl">{titles[mode]}</CardTitle>
            <CardDescription>{descs[mode]}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={mode === "forgot" ? handleForgot : handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required />
              </div>
              {mode !== "forgot" && (
                <div className="space-y-2">
                  <Label>Senha</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Aguarde..." : mode === "forgot" ? "Enviar Link" : "Entrar"}
              </Button>
            </form>
            <div className="mt-4 space-y-2 text-center text-sm">
              {mode === "login" && (
                <button onClick={() => setMode("forgot")} className="text-muted-foreground hover:text-primary block mx-auto">Esqueceu a senha?</button>
              )}
              {mode !== "login" && (
                <button onClick={() => setMode("login")} className="text-primary hover:underline">Voltar ao login</button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
