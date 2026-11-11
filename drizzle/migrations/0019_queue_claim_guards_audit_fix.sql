CREATE OR REPLACE FUNCTION public.iam_queue_pre_claim_guards()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $f$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT q.id, q.target_identity, COALESCE(c.entra_id, t.entra_id) AS eid
    FROM public.iam_queue q
    LEFT JOIN public.colaboradores c ON c.id=q.colaborador_id
    LEFT JOIN public.terceiros t ON t.id=q.terceiro_id
    WHERE q.action_type='create_if_not_exists'
      AND (q.status='pending' OR (q.status='processing' AND q.lease_expires_at<=now()))
      AND COALESCE(c.entra_id, t.entra_id) IS NOT NULL
  LOOP
    UPDATE public.iam_queue SET status='success', processed_at=now(),
      result_message='Conta já existente no Entra ('||r.eid||'); criação dispensada.',
      claim_token=NULL, lease_expires_at=NULL
    WHERE id=r.id;
    INSERT INTO public.auditoria(operador, acao, entidade, entidade_id, resumo, detalhes)
    VALUES ('sistema','iam_queue_create_already_exists','iam_queue',r.id::text,
      'Criação dispensada: conta de '||COALESCE(r.target_identity,'')||' já existe no Entra',
      jsonb_build_object('entra_id',r.eid));
  END LOOP;

  FOR r IN
    SELECT id, action_type, target_identity, claim_attempts FROM public.iam_queue
    WHERE status='processing' AND lease_expires_at<=now() AND COALESCE(claim_attempts,0)>=3
  LOOP
    UPDATE public.iam_queue SET status='failed', error_code='agent_no_response', processed_at=now(),
      result_message='Hermes pegou o item '||r.claim_attempts||' vezes sem responder.',
      claim_token=NULL, lease_expires_at=NULL
    WHERE id=r.id;
    INSERT INTO public.alertas(tipo, severidade, titulo, mensagem, ref_tipo, ref_id, ref_url)
    VALUES ('fila_sem_resposta','aviso'::public.severidade_alerta,
      'Hermes sem resposta: '||COALESCE(r.target_identity,''),
      'O item "'||r.action_type||'" foi pego '||r.claim_attempts||' vezes sem retorno e foi marcado como falha.',
      'iam_queue', r.id::text, '/fila-provisionamento?tab=fila&sel='||r.id);
  END LOOP;
END $f$;