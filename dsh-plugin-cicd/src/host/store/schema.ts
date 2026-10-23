export const SCHEMA_VERSION = 2

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS pipelines (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  config_json   TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS runs (
  id                    TEXT PRIMARY KEY,
  pipeline_id           TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  trigger               TEXT NOT NULL,
  status                TEXT NOT NULL,
  commit_sha            TEXT NOT NULL DEFAULT '',
  branch                TEXT NOT NULL DEFAULT '',
  image_ref             TEXT NOT NULL DEFAULT '',
  image_digest          TEXT NOT NULL DEFAULT '',
  runner_kind           TEXT NOT NULL DEFAULT '',
  target_environment    TEXT NOT NULL DEFAULT '',
  namespace             TEXT NOT NULL DEFAULT '',
  plan_hash             TEXT NOT NULL DEFAULT '',
  config_snapshot_json  TEXT NOT NULL DEFAULT '{}',
  error_code            TEXT NOT NULL DEFAULT '',
  error_message         TEXT NOT NULL DEFAULT '',
  cleanup_state         TEXT NOT NULL DEFAULT 'not_started',
  cleanup_message       TEXT NOT NULL DEFAULT '',
  started_at            INTEGER,
  finished_at           INTEGER,
  created_at            INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS runs_pipeline_created ON runs (pipeline_id, created_at DESC);
CREATE INDEX IF NOT EXISTS runs_created ON runs (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS runs_one_active
  ON runs (pipeline_id)
  WHERE status IN ('queued', 'running', 'awaiting_approval', 'cancelling');

CREATE TABLE IF NOT EXISTS stages (
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  ordinal       INTEGER NOT NULL,
  status        TEXT NOT NULL,
  started_at    INTEGER,
  finished_at   INTEGER,
  exit_code     INTEGER,
  error_code    TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  detail_json   TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (run_id, key)
) STRICT;
CREATE INDEX IF NOT EXISTS stages_run_order ON stages (run_id, ordinal);

CREATE TABLE IF NOT EXISTS stage_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  stage_key  TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  ts         INTEGER NOT NULL,
  stream     TEXT NOT NULL,
  text       TEXT NOT NULL,
  UNIQUE (run_id, stage_key, seq)
) STRICT;
CREATE INDEX IF NOT EXISTS stage_logs_lookup ON stage_logs (run_id, stage_key, seq);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT,
  ts           INTEGER NOT NULL,
  kind         TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}'
) STRICT;
CREATE INDEX IF NOT EXISTS events_run_ts ON events (run_id, ts);

CREATE TABLE IF NOT EXISTS runner_profiles (
  id          TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
) STRICT;
`
