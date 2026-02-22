CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,   -- SHA-256, never the raw key
  name TEXT NOT NULL,              -- "Claude Code - MacBook"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ           -- soft delete
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id  ON api_keys(user_id);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own keys"   ON api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own keys" ON api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own keys" ON api_keys FOR UPDATE USING (auth.uid() = user_id);
