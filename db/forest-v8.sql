-- FUTURE Forest V8 migration. Do NOT apply to production automatically.
-- Apply to the isolated 2D D1 database only after db/schema.sql, on staging
-- first, with backups, verified server writes and serializable room ownership.
-- Client-side browser code MUST NOT be allowed to execute these statements.
CREATE TABLE IF NOT EXISTS forest_score_events (
 event_id TEXT PRIMARY KEY CHECK(length(event_id) BETWEEN 16 AND 128),
 scope TEXT NOT NULL CHECK(scope IN ('free1','vip1')),
 period_id TEXT NOT NULL CHECK(length(period_id)=10),
 uid TEXT NOT NULL CHECK(length(uid) BETWEEN 1 AND 128),
 player_label TEXT NOT NULL CHECK(length(player_label) BETWEEN 1 AND 40),
 claim_id TEXT NOT NULL CHECK(length(claim_id) BETWEEN 8 AND 128),
 kind TEXT NOT NULL CHECK(kind IN ('map_coin','lucky_box')),
 score_delta INTEGER NOT NULL CHECK(score_delta IN (1,2,100,500,1000,5000,10000)),
 collected_at INTEGER NOT NULL CHECK(collected_at>0),
 UNIQUE(scope, claim_id),
 CHECK((kind='map_coin' AND score_delta IN (1,2))
    OR (kind='lucky_box' AND score_delta IN (100,500,1000,5000,10000)))
);
CREATE INDEX IF NOT EXISTS idx_forest_score_events_uid
 ON forest_score_events(uid,scope,period_id,collected_at);

-- One verified event credits the leaderboard once, even if the message
-- is retried. The caller MUST have proven a real pickup via the world owner.
CREATE TRIGGER IF NOT EXISTS credit_verified_forest_event
 AFTER INSERT ON forest_score_events
BEGIN
 INSERT INTO leaderboard_entries(scope,period_id,uid,player_label,score,updated_at)
 VALUES(NEW.scope,NEW.period_id,NEW.uid,NEW.player_label,NEW.score_delta,NEW.collected_at)
 ON CONFLICT(scope,period_id,uid) DO UPDATE SET
 score=leaderboard_entries.score+excluded.score,
 updated_at=MAX(leaderboard_entries.updated_at,excluded.updated_at);
END;

CREATE TABLE IF NOT EXISTS forest_verified_payments (
 transaction_id TEXT PRIMARY KEY CHECK(length(transaction_id) BETWEEN 8 AND 128),
 order_id TEXT NOT NULL UNIQUE CHECK(length(order_id) BETWEEN 8 AND 128),
 uid TEXT NOT NULL CHECK(length(uid) BETWEEN 1 AND 128),
 product TEXT NOT NULL CHECK(product IN ('doubleCoins','doubleSpeed')),
 amount_thb INTEGER NOT NULL CHECK(amount_thb>0),
 verified_at INTEGER NOT NULL CHECK(verified_at>0),
 provider TEXT NOT NULL CHECK(provider='Slip2Go'),
 CHECK((product='doubleCoins' AND amount_thb=20)
    OR (product='doubleSpeed' AND amount_thb=10))
);

CREATE TABLE IF NOT EXISTS forest_boost_entitlements (
 uid TEXT NOT NULL CHECK(length(uid) BETWEEN 1 AND 128),
 product TEXT NOT NULL CHECK(product IN ('doubleCoins','doubleSpeed')),
 expires_at INTEGER NOT NULL CHECK(expires_at>0),
 updated_at INTEGER NOT NULL CHECK(updated_at>0),
 PRIMARY KEY(uid,product)
);

-- Purchase retries with the same real bank transaction ID cannot extend again.
-- The trusted API must verify the slip at the provider FIRST and ensure
-- receiver, amount, order, account, timestamp and replay constraints.
CREATE TRIGGER IF NOT EXISTS credit_verified_forest_payment
 AFTER INSERT ON forest_verified_payments
BEGIN
 INSERT INTO forest_boost_entitlements(uid,product,expires_at,updated_at)
 VALUES(NEW.uid,NEW.product,NEW.verified_at+86400000,NEW.verified_at)
 ON CONFLICT(uid,product) DO UPDATE SET
 expires_at=MAX(forest_boost_entitlements.expires_at,NEW.verified_at)+86400000,
 updated_at=NEW.verified_at;
END;

CREATE TABLE IF NOT EXISTS forest_round_winners (
 scope TEXT NOT NULL CHECK(scope IN ('free1','vip1')),
 period_id TEXT NOT NULL CHECK(length(period_id)=10),
 uid TEXT NOT NULL CHECK(length(uid) BETWEEN 1 AND 128),
 player_label TEXT NOT NULL CHECK(length(player_label) BETWEEN 1 AND 40),
 score INTEGER NOT NULL CHECK(score>=0),
 captured_at INTEGER NOT NULL CHECK(captured_at>0),
 PRIMARY KEY(scope,period_id)
);
