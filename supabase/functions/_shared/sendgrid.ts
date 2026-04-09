const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";

interface SendGridParams {
  to: string;
  subject: string;
  htmlContent: string;
  from?: string;
  fromName?: string;
}

interface SendGridResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

export async function sendEmail(params: SendGridParams): Promise<SendGridResult> {
  const apiKey = Deno.env.get("SENDGRID_API_KEY");
  if (!apiKey) {
    return { success: false, error: "SENDGRID_API_KEY não configurada" };
  }

  const from = params.from || "noreply@origoenergia.com.br";
  const fromName = params.fromName || "Origo Identity";

  const body = {
    personalizations: [{ to: [{ email: params.to }] }],
    from: { email: from, name: fromName },
    subject: params.subject,
    content: [{ type: "text/html", value: params.htmlContent }],
  };

  try {
    const res = await fetch(SENDGRID_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status >= 200 && res.status < 300) {
      return { success: true, statusCode: res.status };
    }

    const errText = await res.text();
    console.error(`[SendGrid] Erro ${res.status}: ${errText}`);
    return { success: false, statusCode: res.status, error: errText };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error(`[SendGrid] Exceção: ${msg}`);
    return { success: false, error: msg };
  }
}
