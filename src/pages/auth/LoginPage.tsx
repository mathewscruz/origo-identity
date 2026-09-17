import { useState, useEffect } from "react";
import logoImg from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ShieldCheck, Bot, ClipboardCheck, Eye, EyeOff, Loader2, ArrowLeft, MailCheck, AlertCircle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

// Only accept same-origin relative paths for `next` — never absolute URLs.
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

const AUTH_ERRORS: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed": "E-mail ainda não confirmado. Verifique sua caixa de entrada.",
  "Too many requests": "Muitas tentativas. Aguarde um instante e tente de novo.",
  "User not found": "Não encontramos uma conta com este e-mail.",
};
const friendly = (msg: string) => AUTH_ERRORS[msg] ?? (/rate limit/i.test(msg) ? AUTH_ERRORS["Too many requests"] : msg);

const HIGHLIGHTS = [
  { icon: ShieldCheck, title: "Identidades sob controle", text: "Colaboradores, terceiros, perfis e exceções em um só lugar, com auditoria imutável." },
  { icon: Bot, title: "Hermes decide, o agente executa", text: "Toda mudança em AD, Entra ID e apps passa pela fila e é executada pelo Órigo Agente." },
  { icon: ClipboardCheck, title: "Revisões que terminam em ação", text: "Gestores e owners decidem quem fica; as revogações acontecem sozinhas." },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextPath = safeNext(params.get("next"));
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate(nextPath, { replace: true });
  }, [user, navigate, nextPath]);

  const switchMode = (m: "login" | "forgot") => { setMode(m); setError(null); setSent(false); };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(friendly(error.message));
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    if (error) setError(friendly(error.message));
    else setSent(true);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* painel de marca */}
      <div className="relative hidden overflow-hidden bg-[hsl(222_47%_11%)] text-white lg:flex lg:w-1/2 xl:w-[55%]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary)/0.45),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,hsl(var(--primary)/0.25),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(hsl(0_0%_100%)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Órigo" className="h-10 w-10 rounded-xl shadow-lg ring-1 ring-white/20" />
            <div className="leading-tight"><p className="text-sm font-semibold">Órigo Access & Identity</p><p className="text-[11px] text-white/60">Identity Governance & Administration</p></div>
          </div>
          <div className="max-w-lg space-y-8">
            <div className="space-y-3">
              <h1 className="text-4xl font-bold tracking-tight xl:text-[44px] xl:leading-[1.1]">Acessos certos,<br />para as pessoas certas,<br />pelo tempo certo.</h1>
              <p className="text-base text-white/70">Ciclo de vida de identidades da Órigo Energia — do RH ao diretório, com aprovação, revisão e execução automática.</p>
            </div>
            <ul className="space-y-4">
              {HIGHLIGHTS.map((h) => (
                <li key={h.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15"><h.icon className="h-4 w-4 text-primary-foreground" /></span>
                  <div><p className="text-sm font-medium">{h.title}</p><p className="text-[13px] leading-snug text-white/60">{h.text}</p></div>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-white/40">© {new Date().getFullYear()} Órigo Energia · acesso restrito a usuários autorizados · toda atividade é registrada</p>
        </div>
      </div>

      {/* formulário */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2 xl:w-[45%]">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
            <img src={logoImg} alt="Órigo" className="mb-5 h-12 w-12 rounded-xl shadow-md lg:hidden" />
            <h2 className="text-2xl font-semibold tracking-tight">{mode === "login" ? "Entrar no painel" : "Redefinir senha"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{mode === "login" ? "Use seu e-mail corporativo e senha do painel." : "Enviaremos um link para você criar uma nova senha."}</p>
          </div>

          {sent ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div><p className="font-medium">Link enviado para {email}</p><p className="mt-0.5 text-muted-foreground">Confira a caixa de entrada (e o spam). O link vale por pouco tempo.</p></div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => switchMode("login")}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao login</Button>
            </div>
          ) : (
            <form onSubmit={mode === "forgot" ? handleForgot : handleLogin} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} placeholder="nome@origoenergia.com.br" required className="h-10" />
              </div>
              {mode === "login" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between"><Label htmlFor="password">Senha</Label><button type="button" onClick={() => switchMode("forgot")} className="text-xs text-muted-foreground hover:text-primary">Esqueceu a senha?</button></div>
                  <div className="relative">
                    <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} placeholder="••••••••" required className="h-10 pr-10" />
                    <button type="button" tabIndex={-1} onClick={() => setShowPassword((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
                </div>
              )}
              <Button type="submit" className={cn("h-10 w-full", loading && "cursor-progress")} disabled={loading || !email || (mode === "login" && !password)}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{mode === "forgot" ? "Enviando…" : "Entrando…"}</> : mode === "forgot" ? "Enviar link" : "Entrar"}
              </Button>
              {mode === "forgot" && <Button type="button" variant="ghost" className="w-full" onClick={() => switchMode("login")}><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao login</Button>}
            </form>
          )}

          <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground lg:justify-start"><Lock className="h-3 w-3" />Sessão protegida · acesso concedido pelo administrador do painel</p>
        </div>
      </div>
    </div>
  );
}
