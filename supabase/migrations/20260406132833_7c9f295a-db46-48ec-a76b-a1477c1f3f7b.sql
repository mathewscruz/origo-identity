
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can update revisao_itens' AND tablename = 'revisao_itens') THEN
    CREATE POLICY "Anon can update revisao_itens" ON public.revisao_itens FOR UPDATE TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anon can update revisoes' AND tablename = 'revisoes') THEN
    CREATE POLICY "Anon can update revisoes" ON public.revisoes FOR UPDATE TO anon USING (true);
  END IF;
END $$;
