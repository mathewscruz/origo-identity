// Aviso por Telegram via conector (no-op enquanto o bot não estiver conectado).
// Destino: parâmetro `telegram_chat_id`.
// deno-lint-ignore no-explicit-any
export async function notifyTelegram(supabase: any, text: string): Promise<{ sent: boolean; reason?: string }> {
  const env = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env;
  const lovKey = env?.get("LOVABLE_API_KEY");
  const tgKey = env?.get("TELEGRAM_API_KEY");
  if (!lovKey || !tgKey) return { sent: false, reason: "telegram_nao_conectado" };
  const { data } = await supabase.from("parametros").select("valor").eq("chave", "telegram_chat_id").maybeSingle();
  const chatId = data?.valor?.trim();
  if (!chatId) return { sent: false, reason: "telegram_chat_id_vazio" };
  const res = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovKey}`, "X-Connection-Api-Key": tgKey, "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    console.error(`[telegram] ${res.status}: ${await res.text()}`);
    return { sent: false, reason: `http_${res.status}` };
  }
  return { sent: true };
}
