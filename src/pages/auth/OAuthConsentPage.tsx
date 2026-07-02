import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, CheckCircle2, XCircle } from "lucide-react";
import logoImg from "@/assets/logo.png";

// Typed shim for the beta supabase.auth.oauth namespace.
type OAuthClient = { name?: string; client_name?: string; redirect_uri?: string; redirect_uris?: string[] };
type OAuthDetails = {
  client?: OAuthClient;
  scope?: string;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthResult = { redirect_url?: string; redirect_to?: string };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: { message: string } | null }>;
};
const oauthApi = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsentPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Parâmetro authorization_id ausente.");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
        return;
      }
      setUserEmail(sess.session.user.email ?? null);
      const { data, error } = await oauthApi.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId, navigate]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauthApi.approveAuthorization(authorizationId)
      : await oauthApi.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      return setError("O servidor de autorização não retornou um redirect.");
    }
    window.location.href = target;
  }

  const clientName = details?.client?.client_name ?? details?.client?.name ?? "Aplicação externa";
  const redirectUri = details?.client?.redirect_uri ?? details?.client?.redirect_uris?.[0];
  const scopes = details?.scopes ?? (details?.scope ? details.scope.split(/\s+/).filter(Boolean) : []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <img src={logoImg} alt="Órigo" className="h-9 w-9 rounded-lg" />
          </div>
          <CardTitle className="text-xl">Conectar {clientName} ao Órigo</CardTitle>
          <CardDescription>
            Isso permite que <span className="font-medium">{clientName}</span> use este sistema como você
            {userEmail ? ` (${userEmail})` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="text-sm rounded-md border border-destructive/40 bg-destructive/5 text-destructive p-3">
              {error}
            </div>
          )}

          {!details && !error && <p className="text-sm text-muted-foreground text-center">Carregando…</p>}

          {details && (
            <>
              <div className="rounded-lg border p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  <span>Cliente</span>
                </div>
                <div className="font-medium">{clientName}</div>
                {redirectUri && <div className="text-xs text-muted-foreground break-all">{redirectUri}</div>}
              </div>

              <div className="rounded-lg border p-3 text-sm space-y-1">
                <div className="text-muted-foreground">O aplicativo poderá:</div>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Chamar as ferramentas habilitadas do Órigo enquanto você estiver conectado</li>
                  <li>Consultar/atuar sobre dados respeitando seus papéis e RLS</li>
                </ul>
                {scopes.length > 0 && (
                  <div className="pt-2 text-xs text-muted-foreground">
                    Escopos: {scopes.join(", ")}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Isso não substitui as políticas de acesso do sistema. Você pode revogar a conexão a qualquer momento.
              </p>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
                  <XCircle className="h-4 w-4 mr-1" /> Negar
                </Button>
                <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
