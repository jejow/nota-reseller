CREATE TABLE IF NOT EXISTS owner_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS owner_sessions_expires ON owner_sessions (expires_at);

CREATE TABLE IF NOT EXISTS owner_login_attempts (
  client_hash TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL,
  hits INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS owner_login_attempts_expires ON owner_login_attempts (expires_at);
