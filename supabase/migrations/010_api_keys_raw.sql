-- Store the raw API key so users can reveal it later.
-- Column is protected by existing RLS ("Users view own keys").
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_raw TEXT;
