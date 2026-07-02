import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

const FALLBACK_SUPABASE_URL = 'https://jobopjhhxgcfanlhzlkc.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvYm9wamhoeGdjZmFubGh6bGtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NzMyMTcsImV4cCI6MjA4OTM0OTIxN30.Hj5rhgW0U4XfbkjTGO9swcQhlP25ArfX1lbzKOum7QQ';

type RuntimeEnv = Record<string, string | undefined>;

function runtimeEnv(): RuntimeEnv {
  const metaEnv = ((import.meta as unknown as { env?: RuntimeEnv }).env ?? {}) as RuntimeEnv;
  const denoEnv = (globalThis as unknown as { Deno?: { env?: { get?: (name: string) => string | undefined } } }).Deno?.env;
  return {
    ...metaEnv,
    SUPABASE_URL: metaEnv.SUPABASE_URL ?? denoEnv?.get?.("SUPABASE_URL"),
    SUPABASE_PUBLISHABLE_KEY: metaEnv.SUPABASE_PUBLISHABLE_KEY ?? denoEnv?.get?.("SUPABASE_PUBLISHABLE_KEY"),
  };
}

export function getSupabaseConfig() {
  const env = runtimeEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? FALLBACK_SUPABASE_URL;
  const supabasePublishableKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? FALLBACK_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase environment is not configured for MCP tools");
  }
  return { supabaseUrl, supabasePublishableKey };
}

export function sb(ctx: ToolContext) {
  const { supabaseUrl, supabasePublishableKey } = getSupabaseConfig();
  return createClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
