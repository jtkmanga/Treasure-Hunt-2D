-- Load AFTER db/schema.sql into a NEW isolated 2D D1 database.
-- Each round is verified server-side; no direct client SQL or score authority.
CREATE TABLE IF NOT EXISTS game_runs (
  run_id TEXT PRIMARY KEY CHECK(length(run_id)=36),
  uid TEXT NOT NULL CHECK(length(uid) BETWEEN 1 AND 128),
  scope TEXT NOT NULL CHECK(scope IN ('free1','vip1')),
  period_id TEXT NOT NULL CHECK(length(period_id)=10),
  level INTEGER NOT NULL CHECK(level BETWEEN 0 AND 2),
  seed INTEGER NOT NULL CHECK(seed BETWEEN 0 AND 4294967295),
  started_at INTEGER NOT NULL CHECK(started_at>0),
  expires_at INTEGER NOT NULL CHECK(expires_at>started_at),
  status TEXT NOT NULL CHECK(status IN ('active','abandoned','finished')),
  player_label TEXT NOT NULL CHECK(length(player_label) BETWEEN 1 AND 40),
  finished_at INTEGER,
  score INTEGER CHECK(score IS NULL OR score BETWEEN 0 AND 3500)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_one_active_per_user
  ON game_runs(uid) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_runs_user_period
  ON game_runs(uid,scope,period_id,started_at);

-- No more than 10 ranked attempts per player per Free competition period.
-- Other offline/unranked gameplay remains unlimited at the browser level.
-- Rejects abuse before writing additional run rows.
CREATE TRIGGER IF NOT EXISTS guard_ranked_runs_per_period
BEFORE INSERT ON game_runs
WHEN (SELECT COUNT(*) FROM game_runs
      WHERE uid=NEW.uid AND scope=NEW.scope AND period_id=NEW.period_id)>=10
BEGIN
  SELECT RAISE(ABORT,'Ranked run budget exceeded');
END;

-- At-most-once score credit: the trigger fires only if the unique run changes
-- active -> finished. If duplicate completions race, exactly one wins.
CREATE TRIGGER IF NOT EXISTS credit_completed_ranked_run
AFTER UPDATE OF status ON game_runs
WHEN OLD.status='active' AND NEW.status='finished' AND NEW.score>0
BEGIN
  INSERT INTO leaderboard_entries(scope,period_id,uid,player_label,score,updated_at)
  VALUES (NEW.scope,NEW.period_id,NEW.uid,NEW.player_label,NEW.score,NEW.finished_at)
  ON CONFLICT(scope,period_id,uid) DO UPDATE SET
     score=leaderboard_entries.score+excluded.score,
     updated_at=excluded.updated_at;
END;
