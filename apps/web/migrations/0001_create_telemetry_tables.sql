-- Anonymous desktop app installs (one row per install_id)
CREATE TABLE IF NOT EXISTS installs (
  install_id    TEXT PRIMARY KEY,
  first_seen_at INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  app_version   TEXT NOT NULL,
  os_version    TEXT,
  arch          TEXT,
  ram_gb        INTEGER,
  country       TEXT
);

CREATE INDEX IF NOT EXISTS idx_installs_last_seen_at ON installs(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_installs_first_seen_at ON installs(first_seen_at);

-- Append-only telemetry event log
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  install_id    TEXT NOT NULL,
  session_id    TEXT NOT NULL,
  event_name    TEXT NOT NULL,
  app_version   TEXT NOT NULL,
  properties    TEXT,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_name_time  ON events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_events_install    ON events(install_id, created_at);
