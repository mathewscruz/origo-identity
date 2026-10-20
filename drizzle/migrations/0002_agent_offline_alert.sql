CREATE OR REPLACE FUNCTION public.agent_offline_check() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seen timestamptz;
BEGIN
  SELECT max(last_seen_at) INTO v_seen FROM public.iam_agent_status;
  IF (v_seen IS NULL OR v_seen < now() - interval '10 minutes')
     AND NOT EXISTS (SELECT 1 FROM public.alertas WHERE tipo='agent_offline' AND NOT lido) THEN
    INSERT INTO public.alertas (tipo, severidade, titulo, mensagem, ref_url)
    VALUES ('agent_offline', 'critico', 'Hermes Agent sem sinal',
      'O agente não se comunica desde ' || COALESCE(to_char(v_seen AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'), 'nunca') || '. Nenhuma ação está sendo executada.',
      '/configuracoes/agente');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.agent_offline_check() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_offline_check() TO authenticated, service_role;