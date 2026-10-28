PRAGMA foreign_keys = ON;

CREATE TABLE categories (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name_ar TEXT NOT NULL CHECK(length(trim(name_ar)) BETWEEN 1 AND 160),
 name_en TEXT NOT NULL CHECK(length(trim(name_en)) BETWEEN 1 AND 160),
 image_url TEXT NOT NULL DEFAULT '', visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)),
 sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX categories_display ON categories(visible,sort_order,id);
CREATE TABLE products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
 name_ar TEXT NOT NULL CHECK(length(trim(name_ar)) BETWEEN 1 AND 160),
 name_en TEXT NOT NULL CHECK(length(trim(name_en)) BETWEEN 1 AND 160),
 description_ar TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
 price INTEGER NOT NULL CHECK(price BETWEEN 0 AND 100000000),
 stock INTEGER NOT NULL DEFAULT 0 CHECK(stock BETWEEN 0 AND 1000000),
 image_url TEXT NOT NULL DEFAULT '', visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)),
 sort_order INTEGER NOT NULL DEFAULT 0, subject TEXT NOT NULL DEFAULT '',
 academic_level TEXT NOT NULL DEFAULT '', teacher_name TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX products_category_display ON products(category_id,visible,sort_order,id);
CREATE INDEX products_newest ON products(created_at DESC);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL CHECK(json_valid(value)));
INSERT INTO settings VALUES(1,'{"name_ar":"مكتبتي","name_en":"Maktabati","logo_url":"","phone":"","email":"","address_ar":"","address_en":"","currency":"IQD","default_language":"ar","low_stock_threshold":5}');
CREATE TABLE delivery_rates(governorate TEXT PRIMARY KEY, fee INTEGER NOT NULL CHECK(fee BETWEEN 0 AND 10000000), enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)));
INSERT INTO delivery_rates VALUES
('Baghdad',5000,1),('Basra',7000,1),('Nineveh',7000,1),('Erbil',7000,1),('Najaf',7000,1),('Karbala',7000,1),('Sulaymaniyah',7000,1),('Duhok',7000,1),('Kirkuk',7000,1),('Diyala',7000,1),('Anbar',7000,1),('Babil',7000,1),('Wasit',7000,1),('Maysan',7000,1),('Dhi Qar',7000,1),('Muthanna',7000,1),('Qadisiyyah',7000,1),('Saladin',7000,1),('Halabja',7000,1);
INSERT INTO categories(name_ar,name_en,image_url,sort_order) VALUES('قرطاسية','Stationery','/samples/notebook.svg',0),('ملازم','Printed Study Booklets','/samples/math.svg',1);
CREATE TABLE administrators (
 id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, password_iterations INTEGER NOT NULL DEFAULT 100000,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,admin_id INTEGER NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE auth_attempts(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,window_start INTEGER NOT NULL);
CREATE TABLE images(id INTEGER PRIMARY KEY AUTOINCREMENT,object_key TEXT NOT NULL UNIQUE,url TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,admin_id INTEGER REFERENCES administrators(id),created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT NOT NULL UNIQUE,
 idempotency_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL, access_token_hash TEXT NOT NULL,
 customer_name TEXT NOT NULL, phone TEXT NOT NULL, governorate TEXT NOT NULL, area TEXT NOT NULL, address TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
 subtotal INTEGER NOT NULL CHECK(subtotal>=0), delivery_fee INTEGER NOT NULL CHECK(delivery_fee>=0), total INTEGER NOT NULL CHECK(total=subtotal+delivery_fee), currency TEXT NOT NULL,
 payment_method TEXT NOT NULL DEFAULT 'cod' CHECK(payment_method='cod'),
 payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','paid')),
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','preparing','shipped','completed','cancelled')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX orders_created ON orders(created_at DESC,id DESC);
CREATE INDEX orders_status ON orders(status,payment_status);
CREATE TABLE order_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
 name_ar TEXT NOT NULL,name_en TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 999),
 image_url TEXT NOT NULL DEFAULT '', UNIQUE(order_id,product_id)
);
CREATE INDEX order_items_order ON order_items(order_id);
CREATE TRIGGER validate_checkout_settings BEFORE INSERT ON orders
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM delivery_rates WHERE governorate=NEW.governorate AND enabled=1 AND fee=NEW.delivery_fee) OR NEW.currency!=json_extract((SELECT value FROM settings WHERE id=1),'$.currency') THEN RAISE(ABORT,'STORE_CHANGED') END;
END;
-- D1 batch is a transaction. The trigger checks the current row and decrements
-- stock in that same transaction, so concurrent checkouts cannot oversell.
CREATE TRIGGER reserve_inventory BEFORE INSERT ON order_items
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM products p JOIN categories c ON c.id=p.category_id WHERE p.id=NEW.product_id AND p.visible=1 AND c.visible=1 AND p.stock>=NEW.quantity AND p.price=NEW.price AND p.name_ar=NEW.name_ar AND p.name_en=NEW.name_en) THEN RAISE(ABORT,'STOCK_CHANGED') END;
 UPDATE products SET stock=stock-NEW.quantity,updated_at=datetime('now') WHERE id=NEW.product_id;
END;
CREATE TRIGGER restock_cancelled AFTER UPDATE OF status ON orders
WHEN NEW.status='cancelled' AND OLD.status!='cancelled'
BEGIN
 UPDATE products SET stock=stock+COALESCE((SELECT quantity FROM order_items WHERE order_id=NEW.id AND product_id=products.id),0),updated_at=datetime('now') WHERE id IN (SELECT product_id FROM order_items WHERE order_id=NEW.id);
END;
