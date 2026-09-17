-- =============================================================================
-- SEED LOCAL — executado automaticamente após as migrations em
-- `supabase start` (primeira vez) e `supabase db reset`.
-- NÃO roda em produção (Lovable Cloud não usa este arquivo).
-- =============================================================================

-- Usuário administrador local
--   e-mail: admin@origo.local
--   senha : Origo@local123
DO $$
DECLARE
  v_uid uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  -- trava de segurança: só cria o admin local no stack de desenvolvimento (segredo JWT demo)
  IF COALESCE(current_setting('app.settings.jwt_secret', true), '') <> 'super-secret-jwt-token-with-at-least-32-characters-long' THEN
    RAISE NOTICE 'seed.sql ignorado: este banco não é o ambiente local';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_uid) THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change, email_change_token_new, is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      'admin@origo.local', extensions.crypt('Origo@local123', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"nome":"Admin Local"}'::jsonb,
      now(), now(), '', '', '', '', false
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_uid, v_uid::text, 'email',
      jsonb_build_object('sub', v_uid::text, 'email', 'admin@origo.local', 'email_verified', true),
      now(), now(), now()
    );
  END IF;

  -- profiles é preenchido pelo trigger on_auth_user_created; garante o papel admin
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- evita o modal "Alterar Senha Obrigatória" (default do campo é true)
  UPDATE public.profiles SET must_change_password = false WHERE id = v_uid;
END $$;
