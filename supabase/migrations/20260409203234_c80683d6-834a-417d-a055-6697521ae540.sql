
-- Add missing columns to revisoes
ALTER TABLE revisoes ADD COLUMN IF NOT EXISTS token text;
ALTER TABLE revisoes ADD COLUMN IF NOT EXISTS aplicacao_id uuid;
ALTER TABLE revisoes ADD COLUMN IF NOT EXISTS owner_email text;
ALTER TABLE revisoes ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'aplicacao';

-- Anon INSERT on auditoria (external review page logs audit)
CREATE POLICY "Anon can insert auditoria" ON auditoria FOR INSERT TO anon WITH CHECK (true);

-- Anon INSERT on iam_queue (external review page creates revocation tasks)
CREATE POLICY "Anon can insert iam_queue" ON iam_queue FOR INSERT TO anon WITH CHECK (true);

-- Anon UPDATE on perfil_atribuicoes (external review page revokes assignments)
CREATE POLICY "Anon can update perfil_atribuicoes" ON perfil_atribuicoes FOR UPDATE TO anon USING (true);
