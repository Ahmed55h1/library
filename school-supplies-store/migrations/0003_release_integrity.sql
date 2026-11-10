-- Keep all historical orders, including any duplicates created by the old flow.
-- The first historical order permanently claims its quote, even after expiry.
CREATE TABLE checkout_claims (
 quote_id TEXT PRIMARY KEY,
 customer_id TEXT,
 request_hash TEXT NOT NULL,
 order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT
);
INSERT INTO checkout_claims(quote_id,customer_id,request_hash,order_id)
SELECT o.quote_id,o.customer_id,o.request_hash,o.id FROM orders o
WHERE o.quote_id IS NOT NULL AND o.id=(SELECT MIN(p.id) FROM orders p WHERE p.quote_id=o.quote_id);
-- This claim and reserve_inventory run inside the same D1 batch transaction.
CREATE TRIGGER claim_checkout_quote AFTER INSERT ON orders
WHEN NEW.quote_id IS NOT NULL
BEGIN
 INSERT INTO checkout_claims VALUES(NEW.quote_id,NEW.customer_id,NEW.request_hash,NEW.id);
END;

ALTER TABLE user ADD COLUMN loginName TEXT COLLATE NOCASE;
CREATE UNIQUE INDEX user_login_name ON user(loginName) WHERE loginName IS NOT NULL;
ALTER TABLE user ADD COLUMN passwordChangeRequired INTEGER NOT NULL DEFAULT 0 CHECK(passwordChangeRequired IN (0,1));
-- Database enforcement also covers provisioning and future account writers.
CREATE TRIGGER revoke_account_sessions AFTER UPDATE OF role,disabled ON user
WHEN NEW.role!=OLD.role OR (NEW.disabled=1 AND OLD.disabled=0)
BEGIN
 DELETE FROM mfa_sessions WHERE session_id IN (SELECT id FROM session WHERE userId=NEW.id);
 DELETE FROM session WHERE userId=NEW.id;
END;
CREATE TRIGGER prevent_disabled_session BEFORE INSERT ON session
WHEN EXISTS(SELECT 1 FROM user WHERE id=NEW.userId AND disabled=1)
BEGIN
 SELECT RAISE(ABORT,'ACCOUNT_DISABLED');
END;
