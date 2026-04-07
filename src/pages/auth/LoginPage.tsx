import { useState, useEffect } from "react";
import logoImg from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

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

  const titles = { login: "Access & Identity", forgot: "Redefinir Senha" };
  const descs = { login: "Insira suas credenciais abaixo", forgot: "Informe seu email para receber o link" };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img src={logoImg} alt="Access & Identity" className="h-12 w-12 rounded-lg" />
          </div>
          <CardTitle>{titles[mode]}</CardTitle>
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
  );
}