-- Legacy administrator sessions are deliberately not accepted by Better Auth.
CREATE TABLE user (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
 role TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK(role IN ('ADMIN','STAFF','CUSTOMER')),
 disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)), twoFactorEnabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE session (
 id TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, createdAt INTEGER NOT NULL,
 updatedAt INTEGER NOT NULL, ipAddress TEXT, userAgent TEXT, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX session_user ON session(userId);
CREATE TABLE account (
 id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt INTEGER, refreshTokenExpiresAt INTEGER,
 scope TEXT, password TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
);
CREATE INDEX account_user ON account(userId);
CREATE TABLE verification (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expiresAt INTEGER NOT NULL, createdAt INTEGER, updatedAt INTEGER);
CREATE INDEX verification_identifier ON verification(identifier);
CREATE TABLE twoFactor (id TEXT PRIMARY KEY, secret TEXT NOT NULL, backupCodes TEXT NOT NULL, userId TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE, verified INTEGER DEFAULT 1, failedVerificationCount INTEGER DEFAULT 0, lockedUntil INTEGER);
CREATE TABLE staff_permissions (
 user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 permission TEXT NOT NULL CHECK(permission IN ('categories.manage','products.describe','prices.edit','stock.adjust','orders.read','orders.update')),
 PRIMARY KEY(user_id,permission)
);
-- A verified factor is tied to a particular session, never just to an enrolled user.
CREATE TABLE mfa_sessions (session_id TEXT PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE, verified_at INTEGER NOT NULL);
CREATE TABLE audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL,
 entity_id TEXT NOT NULL, details TEXT NOT NULL CHECK(json_valid(details)), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;
CREATE TABLE checkout_quotes (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id), payload TEXT NOT NULL CHECK(json_valid(payload)), expires_at INTEGER NOT NULL
);
ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES user(id);
ALTER TABLE orders ADD COLUMN quote_id TEXT;
ALTER TABLE orders ADD COLUMN demo INTEGER NOT NULL DEFAULT 1 CHECK(demo=1);
CREATE INDEX customer_orders ON orders(customer_id,id DESC);
CREATE TABLE mail_outbox (
 id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, url TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
DROP TRIGGER restock_cancelled;
CREATE TRIGGER valid_order_transition BEFORE UPDATE OF status ON orders
WHEN NEW.status != OLD.status
BEGIN
 SELECT CASE WHEN NOT (
  (OLD.status='new' AND NEW.status IN ('preparing','cancelled')) OR
  (OLD.status='preparing' AND NEW.status IN ('shipped','cancelled')) OR
  (OLD.status='shipped' AND NEW.status='completed')
 ) THEN RAISE(ABORT,'INVALID_STATUS') END;
END;
CREATE TRIGGER restock_cancelled AFTER UPDATE OF status ON orders
WHEN NEW.status='cancelled' AND OLD.status IN ('new','preparing')
BEGIN
 UPDATE products SET stock=stock+COALESCE((SELECT quantity FROM order_items WHERE order_id=NEW.id AND product_id=products.id),0),updated_at=datetime('now') WHERE id IN (SELECT product_id FROM order_items WHERE order_id=NEW.id);
END;
-- Enforce quote lifetime at the transactional boundary, including after queued reads.
CREATE TRIGGER valid_quote BEFORE INSERT ON orders WHEN NEW.customer_id IS NOT NULL
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM checkout_quotes WHERE id=NEW.quote_id AND user_id=NEW.customer_id AND expires_at>unixepoch()*1000) THEN RAISE(ABORT,'QUOTE_EXPIRED') END;
END;
