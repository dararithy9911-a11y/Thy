-- Trading signals
CREATE TABLE IF NOT EXISTS signals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pair          TEXT    NOT NULL,
  direction     TEXT    NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  entry         REAL    NOT NULL,
  stop_loss     REAL    NOT NULL,
  take_profit_1 REAL    NOT NULL,
  take_profit_2 REAL,
  take_profit_3 REAL,
  status        TEXT    NOT NULL DEFAULT 'active'
                CHECK (status IN ('pending', 'active', 'tp_hit', 'sl_hit', 'closed', 'cancelled')),
  result_pips   REAL,
  note          TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_signals_status     ON signals (status);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals (created_at DESC);
