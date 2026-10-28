-- Isolated 2D ranking table. This phase has NO score write endpoint.
CREATE TABLE IF NOT EXISTS leaderboard_entries (
 scope TEXT NOT NULL CHECK(scope IN ('free1','vip1')),
 period_id TEXT NOT NULL CHECK(length(period_id)=10),
 uid TEXT NOT NULL CHECK(length(uid) BETWEEN 1 AND 128),
 player_label TEXT NOT NULL CHECK(length(player_label) BETWEEN 1 AND 40),
 score INTEGER NOT NULL DEFAULT 0 CHECK(score>=0),
 updated_at INTEGER NOT NULL CHECK(updated_at>=0),
 PRIMARY KEY(scope,period_id,uid)
);
CREATE INDEX IF NOT EXISTS idx_rankings_current ON leaderboard_entries(scope,period_id,score DESC,player_label ASC);
