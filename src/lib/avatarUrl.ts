import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "avatars";

/**
 * Extrai o caminho do arquivo dentro do bucket "avatars".
 * Aceita tanto o caminho puro ("<uid>/avatar.png") quanto URLs públicas legadas.
 */
export function toAvatarPath(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.split("?")[0];
  const marker = `/object/public/${BUCKET}/`;
  const idx = raw.indexOf(marker);
  const path = idx >= 0 ? raw.slice(idx + marker.length) : raw;
  if (!path || /^https?:\/\//i.test(path)) return null;
  return decodeURIComponent(path);
}

/**
 * Gera uma URL assinada temporária para a foto de perfil.
 * O bucket é privado — nenhuma foto é acessível publicamente.
 */
export function useAvatarUrl(avatarUrl?: string | null): string | null {
  const [signed, setSigned] = useState<string | null>(null);
  const path = toAvatarPath(avatarUrl);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setSigned(null);
      return;
    }
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setSigned(data?.signedUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setSigned(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return signed;
}
