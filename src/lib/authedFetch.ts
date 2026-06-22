import { supabase } from "@/integrations/supabase/client";

/**
 * Calls a Supabase Edge Function via fetch using the current user's session JWT
 * (falls back to the anon key when no user session is present, e.g. public routes).
 * Adds standard headers and returns the raw Response.
 */
export async function authedFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token =
    session?.access_token || (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

  const headers = new Headers(init.headers || {});
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("apikey")) headers.set("apikey", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, { ...init, headers });
}
