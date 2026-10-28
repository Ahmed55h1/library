export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  ASSETS: Fetcher;
}
type Row = Record<string, any>;
const SESSION_COOKIE = "maktabati_session";
const MAX_IMAGE = 5 * 1024 * 1024;
const statuses = ["new", "preparing", "shipped", "completed", "cancelled"];
const governorates = [
  "Baghdad",
  "Basra",
  "Nineveh",
  "Erbil",
  "Najaf",
  "Karbala",
  "Sulaymaniyah",
  "Duhok",
  "Kirkuk",
  "Diyala",
  "Anbar",
  "Babil",
  "Wasit",
  "Maysan",
  "Dhi Qar",
  "Muthanna",
  "Qadisiyyah",
  "Saladin",
  "Halabja",
];
class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
function fail(status: number, code: string): never {
  throw new HttpError(status, code);
}
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
const hex = (data: ArrayBuffer) =>
  Array.from(new Uint8Array(data), (n) => n.toString(16).padStart(2, "0")).join(
    "",
  );
const hash = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
function constantEqual(a: string, b: string) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}
function text(value: unknown, max: number, required = false): string {
  if (value === undefined || value === null) {
    if (required) fail(400, "VALIDATION_ERROR");
    return "";
  }
  if (typeof value !== "string") fail(400, "VALIDATION_ERROR");
  const result = value.trim();
  if (result.length > max || (required && !result))
    fail(400, "VALIDATION_ERROR");
  return result;
}
function integer(value: unknown, min = 0, max = 100000000): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    fail(400, "VALIDATION_ERROR");
  return value;
}
function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "VALIDATION_ERROR");
  return value as Row;
}
function visible(value: unknown) {
  if (value !== 0 && value !== 1 && value !== true && value !== false)
    fail(400, "VALIDATION_ERROR");
  return value ? 1 : 0;
}
function imageUrl(value: unknown) {
  const url = text(value, 1000);
  if (
    url &&
    !(url.startsWith("/") && !url.startsWith("//")) &&
    !/^https:\/\/[^\s]+$/i.test(url)
  )
    fail(400, "VALIDATION_ERROR");
  return url;
}
async function boundedBody(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      fail(413, "FILE_TOO_LARGE");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
async function body(request: Request): Promise<Row> {
  if (!request.headers.get("Content-Type")?.includes("application/json"))
    fail(400, "VALIDATION_ERROR");
  try {
    const value = JSON.parse(
      new TextDecoder().decode(await boundedBody(request, 65536)),
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      fail(400, "VALIDATION_ERROR");
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(400, "VALIDATION_ERROR");
  }
}
async function all(
  db: D1Database,
  sql: string,
  ...values: any[]
): Promise<Row[]> {
  const result = await db
    .prepare(sql)
    .bind(...values)
    .all<Row>();
  return result.results;
}
async function first(
  db: D1Database,
  sql: string,
  ...values: any[]
): Promise<Row | null> {
  return db
    .prepare(sql)
    .bind(...values)
    .first<Row>();
}
async function getSettings(db: D1Database) {
  const row = await first(db, "SELECT value FROM settings WHERE id=1");
  return JSON.parse(row!.value);
}
function publicOrder(row: Row) {
  const { idempotency_key, request_hash, access_token_hash, ...result } = row;
  void idempotency_key;
  void request_hash;
  void access_token_hash;
  return result;
}
async function getOrder(db: D1Database, id: number) {
  const order = await first(db, "SELECT * FROM orders WHERE id=?", id);
  if (!order) fail(404, "NOT_FOUND");
  const items = await all(
    db,
    "SELECT * FROM order_items WHERE order_id=? ORDER BY id",
    id,
  );
  return { order: publicOrder(order), items };
}
async function admin(request: Request, env: Env) {
  const cookies = request.headers.get("Cookie") || "";
  const token = cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(SESSION_COOKIE + "="))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return first(
    env.DB,
    "SELECT a.id,a.email FROM sessions s JOIN administrators a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>?",
    await hash(token),
    Date.now(),
  );
}
function checkOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);
  if (!origin || origin !== url.origin) fail(403, "FORBIDDEN");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
    fail(403, "FORBIDDEN");
}
async function login(request: Request, env: Env) {
  const data = await body(request);
  const email = text(data.email, 254, true).toLowerCase();
  if (
    typeof data.password !== "string" ||
    data.password.length < 1 ||
    data.password.length > 1024
  )
    fail(400, "VALIDATION_ERROR");
  const password = data.password;
  const now = Date.now();
  const key = await hash(
    (request.headers.get("CF-Connecting-IP") || "local") + "|" + email,
  );
  await env.DB.prepare(
    "INSERT INTO auth_attempts(key,attempts,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END",
  )
    .bind(key, now, now - 900000, now - 900000)
    .run();
  const attempt = await first(
    env.DB,
    "SELECT attempts FROM auth_attempts WHERE key=?",
    key,
  );
  if (attempt!.attempts > 8) fail(429, "TOO_MANY_ATTEMPTS");
  const account = await first(
    env.DB,
    "SELECT * FROM administrators WHERE email=?",
    email,
  );
  // A dummy derivation gives unknown accounts the same expensive verification path.
  const salt = account?.password_salt || "00000000000000000000000000000000";
  const bytes = Uint8Array.from(
    salt.match(/.{2}/g)!.map((part: string) => parseInt(part, 16)),
  );
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const calculated = hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: bytes,
        iterations: account?.password_iterations || 100000,
      },
      material,
      256,
    ),
  );
  if (!account || !constantEqual(calculated, account.password_hash))
    fail(401, "INVALID_CREDENTIALS");
  const token = random();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(now),
    env.DB.prepare("DELETE FROM auth_attempts WHERE key=?").bind(key),
    env.DB.prepare(
      "INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES(?,?,?)",
    ).bind(await hash(token), account.id, now + 43200000),
  ]);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return json({ admin: { id: account.id, email: account.email } }, 200, {
    "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`,
  });
}
function categoryData(data: Row) {
  return {
    name_ar: text(data.name_ar, 160, true),
    name_en: text(data.name_en, 160, true),
    image_url: imageUrl(data.image_url),
    visible: data.visible === undefined ? 1 : visible(data.visible),
    sort_order:
      data.sort_order === undefined ? 0 : integer(data.sort_order, 0, 1000000),
  };
}
function productData(data: Row) {
  return {
    ...categoryData(data),
    category_id: integer(data.category_id, 1),
    description_ar: text(data.description_ar, 10000),
    description_en: text(data.description_en, 10000),
    price: integer(data.price),
    stock: integer(data.stock, 0, 1000000),
    subject: text(data.subject, 160),
    academic_level: text(data.academic_level, 160),
    teacher_name: text(data.teacher_name, 160),
  };
}
async function saveCategory(request: Request, env: Env, id?: number) {
  const data = await body(request);
  let previous: Row | null = null;
  if (id) {
    previous = await first(env.DB, "SELECT * FROM categories WHERE id=?", id);
    if (!previous) fail(404, "NOT_FOUND");
  }
  const row = categoryData({ ...previous, ...data });
  if (id) {
    await env.DB.prepare(
      "UPDATE categories SET name_ar=?,name_en=?,image_url=?,visible=?,sort_order=? WHERE id=?",
    )
      .bind(
        row.name_ar,
        row.name_en,
        row.image_url,
        row.visible,
        row.sort_order,
        id,
      )
      .run();
  } else {
    if (data.sort_order === undefined) {
      const max = await first(
        env.DB,
        "SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM categories",
      );
      row.sort_order = max!.next;
    }
    const result = await env.DB.prepare(
      "INSERT INTO categories(name_ar,name_en,image_url,visible,sort_order) VALUES(?,?,?,?,?)",
    )
      .bind(
        row.name_ar,
        row.name_en,
        row.image_url,
        row.visible,
        row.sort_order,
      )
      .run();
    id = Number(result.meta.last_row_id);
  }
  return json(
    {
      category: await first(env.DB, "SELECT * FROM categories WHERE id=?", id),
    },
    previous ? 200 : 201,
  );
}
async function saveProduct(request: Request, env: Env, id?: number) {
  const data = await body(request);
  let previous: Row | null = null;
  if (id) {
    previous = await first(env.DB, "SELECT * FROM products WHERE id=?", id);
    if (!previous) fail(404, "NOT_FOUND");
  }
  const row = productData({ ...previous, ...data });
  if (
    !(await first(
      env.DB,
      "SELECT id FROM categories WHERE id=?",
      row.category_id,
    ))
  )
    fail(400, "INVALID_CATEGORY");
  if (!previous && data.sort_order === undefined) {
    const max = await first(
      env.DB,
      "SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM products WHERE category_id=?",
      row.category_id,
    );
    row.sort_order = max!.next;
  }
  const fields = [
    "category_id",
    "name_ar",
    "name_en",
    "description_ar",
    "description_en",
    "price",
    "stock",
    "image_url",
    "visible",
    "sort_order",
    "subject",
    "academic_level",
    "teacher_name",
  ];
  const values = fields.map((key) => row[key as keyof typeof row]);
  if (id) {
    const expected =
      data.expected_stock === undefined
        ? previous!.stock
        : integer(data.expected_stock, 0, 1000000);
    const result = await env.DB.prepare(
      `UPDATE products SET ${fields.map((key) => key + "=?").join(",")},updated_at=datetime('now') WHERE id=? AND stock=?`,
    )
      .bind(...values, id, expected)
      .run();
    if (!result.meta.changes) fail(409, "STOCK_CHANGED");
  } else {
    const result = await env.DB.prepare(
      `INSERT INTO products(${fields.join(",")}) VALUES(${fields.map(() => "?").join(",")})`,
    )
      .bind(...values)
      .run();
    id = Number(result.meta.last_row_id);
  }
  return json(
    { product: await first(env.DB, "SELECT * FROM products WHERE id=?", id) },
    previous ? 200 : 201,
  );
}
async function reorder(
  request: Request,
  env: Env,
  table: "categories" | "products",
) {
  const data = await body(request);
  if (!Array.isArray(data.ids) || data.ids.length > 1000)
    fail(400, "VALIDATION_ERROR");
  const ids = data.ids.map((id: unknown) => integer(id, 1));
  if (new Set(ids).size !== ids.length) fail(400, "VALIDATION_ERROR");
  const categoryId = table === "products" ? integer(data.category_id, 1) : null;
  const rows = await all(
    env.DB,
    `SELECT id FROM ${table}${categoryId ? " WHERE category_id=?" : ""}`,
    ...(categoryId ? [categoryId] : []),
  );
  if (rows.length !== ids.length || rows.some((row) => !ids.includes(row.id)))
    fail(409, "ORDER_CHANGED");
  if (ids.length)
    await env.DB.batch(
      ids.map((id: number, index: number) =>
        env.DB.prepare(
          `UPDATE ${table} SET sort_order=? WHERE id=?${categoryId ? " AND category_id=?" : ""}`,
        ).bind(index, id, ...(categoryId ? [categoryId] : [])),
      ),
    );
  return json({ ok: true });
}
async function removeCategory(request: Request, env: Env, id: number) {
  if (!(await first(env.DB, "SELECT id FROM categories WHERE id=?", id)))
    fail(404, "NOT_FOUND");
  const products = await first(
    env.DB,
    "SELECT COUNT(*) AS count FROM products WHERE category_id=?",
    id,
  );
  let data: Row = {};
  if (request.headers.get("Content-Type")?.includes("application/json"))
    data = await body(request);
  const target =
    data.move_to_id === undefined ? null : integer(data.move_to_id, 1);
  if (target === id) fail(400, "INVALID_CATEGORY");
  if (
    target &&
    !(await first(env.DB, "SELECT id FROM categories WHERE id=?", target))
  )
    fail(400, "INVALID_CATEGORY");
  if (products!.count && !target) fail(409, "CATEGORY_HAS_PRODUCTS");
  const statements = [];
  if (target)
    statements.push(
      env.DB.prepare(
        "UPDATE products SET category_id=?,sort_order=sort_order+COALESCE((SELECT MAX(sort_order)+1 FROM products WHERE category_id=?),0) WHERE category_id=?",
      ).bind(target, target, id),
    );
  statements.push(env.DB.prepare("DELETE FROM categories WHERE id=?").bind(id));
  try {
    await env.DB.batch(statements);
  } catch {
    fail(409, "CATEGORY_HAS_PRODUCTS");
  }
  return json({ ok: true });
}
async function uploadImage(request: Request, env: Env, account: Row) {
  if (!request.headers.get("Content-Type")?.startsWith("multipart/form-data;"))
    fail(400, "INVALID_IMAGE");
  const bytes = await boundedBody(request, MAX_IMAGE + 65536);
  const form = await new Response(bytes, {
    headers: { "Content-Type": request.headers.get("Content-Type")! },
  }).formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) fail(400, "INVALID_IMAGE");
  if (file.size > MAX_IMAGE) fail(413, "FILE_TOO_LARGE");
  const buffer = await file.arrayBuffer();
  const signature = new Uint8Array(buffer);
  let mime = "",
    extension = "";
  if (
    signature[0] === 137 &&
    signature[1] === 80 &&
    signature[2] === 78 &&
    signature[3] === 71 &&
    signature[4] === 13 &&
    signature[5] === 10 &&
    signature[6] === 26 &&
    signature[7] === 10
  ) {
    mime = "image/png";
    extension = "png";
  } else if (
    signature[0] === 255 &&
    signature[1] === 216 &&
    signature[2] === 255
  ) {
    mime = "image/jpeg";
    extension = "jpg";
  } else if (
    new TextDecoder().decode(signature.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(signature.slice(8, 12)) === "WEBP"
  ) {
    mime = "image/webp";
    extension = "webp";
  }
  if (!mime || file.type !== mime) fail(400, "INVALID_IMAGE");
  const key = crypto.randomUUID() + "." + extension;
  const url = "/images/" + key;
  await env.IMAGES.put(key, buffer, {
    httpMetadata: {
      contentType: mime,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
  await env.DB.prepare(
    "INSERT INTO images(object_key,url,mime_type,size,admin_id) VALUES(?,?,?,?,?)",
  )
    .bind(key, url, mime, file.size, account.id)
    .run();
  return json({ url }, 201);
}
async function saveSettings(request: Request, env: Env) {
  const data = await body(request);
  const old = await getSettings(env.DB);
  const settings = {
    ...old,
    ...(data.settings === undefined ? data : object(data.settings)),
  };
  const currency = text(settings.currency, 3, true).toUpperCase();
  try {
    new Intl.NumberFormat("en", { style: "currency", currency });
  } catch {
    fail(400, "VALIDATION_ERROR");
  }
  if (!/^[A-Z]{3}$/.test(currency)) fail(400, "VALIDATION_ERROR");
  if (settings.default_language !== "en" && settings.default_language !== "ar")
    fail(400, "VALIDATION_ERROR");
  const clean = {
    name_ar: text(settings.name_ar, 160, true),
    name_en: text(settings.name_en, 160, true),
    logo_url: imageUrl(settings.logo_url),
    phone: text(settings.phone, 80),
    email: text(settings.email, 254),
    address_ar: text(settings.address_ar, 500),
    address_en: text(settings.address_en, 500),
    currency,
    default_language: settings.default_language,
    low_stock_threshold: integer(settings.low_stock_threshold, 0, 1000000),
  };
  const statements = [
    env.DB.prepare("UPDATE settings SET value=? WHERE id=1").bind(
      JSON.stringify(clean),
    ),
  ];
  if (data.deliveryRates !== undefined) {
    if (
      !Array.isArray(data.deliveryRates) ||
      data.deliveryRates.length !== governorates.length
    )
      fail(400, "VALIDATION_ERROR");
    const seen = new Set();
    for (const value of data.deliveryRates) {
      const rate = object(value);
      if (
        !governorates.includes(rate.governorate) ||
        seen.has(rate.governorate)
      )
        fail(400, "VALIDATION_ERROR");
      seen.add(rate.governorate);
      statements.push(
        env.DB.prepare(
          "UPDATE delivery_rates SET fee=?,enabled=? WHERE governorate=?",
        ).bind(
          integer(rate.fee, 0, 10000000),
          visible(rate.enabled),
          rate.governorate,
        ),
      );
    }
  }
  await env.DB.batch(statements);
  return json({
    settings: clean,
    deliveryRates: await all(
      env.DB,
      "SELECT * FROM delivery_rates ORDER BY governorate",
    ),
  });
}
async function createOrder(request: Request, env: Env) {
  const data = await body(request);
  const key = text(data.idempotency_key, 80, true);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      key,
    )
  )
    fail(400, "VALIDATION_ERROR");
  if (data.payment_method !== "cod") fail(400, "PAYMENT_DISABLED");
  const customer = {
    customer_name: text(data.customer_name, 160, true),
    phone: text(data.phone, 40, true),
    governorate: text(data.governorate, 80, true),
    area: text(data.area, 160, true),
    address: text(data.address, 1000, true),
    notes: text(data.notes, 2000),
  };
  if (
    !/^[+\d\s()\-]{7,40}$/.test(customer.phone) ||
    customer.phone.replace(/\D/g, "").length < 7
  )
    fail(400, "VALIDATION_ERROR");
  if (
    !Array.isArray(data.items) ||
    data.items.length < 1 ||
    data.items.length > 100
  )
    fail(400, "VALIDATION_ERROR");
  const items = data.items
    .map((value: unknown) => {
      const item = object(value);
      return {
        product_id: integer(item.product_id, 1),
        quantity: integer(item.quantity, 1, 999),
      };
    })
    .sort(
      (a: { product_id: number }, b: { product_id: number }) =>
        a.product_id - b.product_id,
    );
  if (
    new Set(items.map((item: { product_id: number }) => item.product_id))
      .size !== items.length
  )
    fail(400, "VALIDATION_ERROR");
  const requestHash = await hash(
    JSON.stringify({ ...customer, items, payment_method: "cod" }),
  );
  const accessHash = await hash(key);
  const existing = await first(
    env.DB,
    "SELECT * FROM orders WHERE idempotency_key=?",
    key,
  );
  if (existing) {
    if (existing.request_hash !== requestHash)
      fail(409, "IDEMPOTENCY_CONFLICT");
    return json({
      ...(await getOrder(env.DB, existing.id)),
      access_token: key,
    });
  }
  const rate = await first(
    env.DB,
    "SELECT * FROM delivery_rates WHERE governorate=? AND enabled=1",
    customer.governorate,
  );
  if (!rate) fail(400, "DELIVERY_UNAVAILABLE");
  const settings = await getSettings(env.DB);
  const products = await all(
    env.DB,
    `SELECT p.* FROM products p JOIN categories c ON c.id=p.category_id WHERE p.visible=1 AND c.visible=1 AND p.id IN (${items.map(() => "?").join(",")})`,
    ...items.map((item: { product_id: number }) => item.product_id),
  );
  let subtotal = 0;
  for (const item of items) {
    const product = products.find((row) => row.id === item.product_id);
    if (!product || product.stock < item.quantity) fail(409, "STOCK_CHANGED");
    subtotal += product.price * item.quantity;
  }
  if (!Number.isSafeInteger(subtotal) || subtotal > 10000000000)
    fail(400, "VALIDATION_ERROR");
  const number =
    "MKT-" +
    new Date().toISOString().slice(0, 10).replace(/-/g, "") +
    "-" +
    crypto.randomUUID().slice(0, 8).toUpperCase();
  const statements = [
    env.DB.prepare(
      "INSERT INTO orders(order_number,idempotency_key,request_hash,access_token_hash,customer_name,phone,governorate,area,address,notes,subtotal,delivery_fee,total,currency) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      number,
      key,
      requestHash,
      accessHash,
      customer.customer_name,
      customer.phone,
      customer.governorate,
      customer.area,
      customer.address,
      customer.notes,
      subtotal,
      rate.fee,
      subtotal + rate.fee,
      settings.currency,
    ),
  ];
  for (const item of items) {
    const product = products.find((row) => row.id === item.product_id)!;
    statements.push(
      env.DB.prepare(
        "INSERT INTO order_items(order_id,product_id,name_ar,name_en,price,quantity,image_url) VALUES((SELECT id FROM orders WHERE idempotency_key=?),?,?,?,?,?,?)",
      ).bind(
        key,
        product.id,
        product.name_ar,
        product.name_en,
        product.price,
        item.quantity,
        product.image_url,
      ),
    );
  }
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const duplicate = await first(
      env.DB,
      "SELECT id,request_hash FROM orders WHERE idempotency_key=?",
      key,
    );
    if (duplicate) {
      if (duplicate.request_hash !== requestHash)
        fail(409, "IDEMPOTENCY_CONFLICT");
      return json({
        ...(await getOrder(env.DB, duplicate.id)),
        access_token: key,
      });
    }
    if (String(error).includes("STOCK_CHANGED")) fail(409, "STOCK_CHANGED");
    if (String(error).includes("STORE_CHANGED")) fail(409, "STORE_CHANGED");
    throw error;
  }
  const order = await first(
    env.DB,
    "SELECT id FROM orders WHERE idempotency_key=?",
    key,
  );
  return json(
    { ...(await getOrder(env.DB, order!.id)), access_token: key },
    201,
  );
}
async function updateOrder(request: Request, env: Env, id: number) {
  const data = await body(request);
  const old = await first(env.DB, "SELECT * FROM orders WHERE id=?", id);
  if (!old) fail(404, "NOT_FOUND");
  const status =
    data.status === undefined ? old.status : text(data.status, 20, true);
  const payment =
    data.payment_status === undefined
      ? old.payment_status
      : text(data.payment_status, 20, true);
  if (!statuses.includes(status) || !["unpaid", "paid"].includes(payment))
    fail(400, "VALIDATION_ERROR");
  if (old.status === "cancelled" && status !== "cancelled")
    fail(409, "INVALID_STATUS");
  if (status === "cancelled" && payment === "paid")
    fail(409, "REFUND_REQUIRED");
  await env.DB.prepare(
    "UPDATE orders SET status=?,payment_status=?,updated_at=datetime('now') WHERE id=? AND (status!='cancelled' OR ?='cancelled')",
  )
    .bind(status, payment, id, status)
    .run();
  return json(await getOrder(env.DB, id));
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (path.startsWith("/images/") && method === "GET") {
    const key = path.slice(8);
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(key)) fail(404, "NOT_FOUND");
    const object = await env.IMAGES.get(key);
    if (!object) fail(404, "NOT_FOUND");
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(object.body, { headers });
  }
  if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
  if (!["GET", "HEAD"].includes(method)) checkOrigin(request);
  if (path === "/api/health" && method === "GET") {
    await env.DB.prepare("SELECT 1").first();
    return json({ ok: true, database: "D1", images: "R2", payments: "cod" });
  }
  if (path === "/api/store" && method === "GET") {
    const [settings, categories, products, deliveryRates] = await Promise.all([
      getSettings(env.DB),
      all(
        env.DB,
        "SELECT * FROM categories WHERE visible=1 ORDER BY sort_order,id",
      ),
      all(
        env.DB,
        "SELECT p.* FROM products p JOIN categories c ON c.id=p.category_id WHERE p.visible=1 AND c.visible=1 ORDER BY c.sort_order,c.id,p.sort_order,p.id",
      ),
      all(env.DB, "SELECT * FROM delivery_rates ORDER BY governorate"),
    ]);
    return json({ settings, categories, products, deliveryRates });
  }
  if (path === "/api/auth/login" && method === "POST")
    return login(request, env);
  if (path === "/api/auth/me" && method === "GET")
    return json({ admin: await admin(request, env) });
  if (path === "/api/auth/logout" && method === "POST") {
    const token = (request.headers.get("Cookie") || "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(SESSION_COOKIE + "="))
      ?.slice(SESSION_COOKIE.length + 1);
    if (token)
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await hash(token))
        .run();
    return json({ ok: true }, 200, {
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${url.protocol === "https:" ? "; Secure" : ""}`,
    });
  }
  if (path === "/api/orders" && method === "POST")
    return createOrder(request, env);
  const orderMatch = path.match(/^\/api\/orders\/(\d+)$/);
  if (orderMatch && method === "GET") {
    const token = url.searchParams.get("token") || "";
    if (!token) fail(404, "NOT_FOUND");
    const order = await first(
      env.DB,
      "SELECT id FROM orders WHERE id=? AND access_token_hash=?",
      Number(orderMatch[1]),
      await hash(token),
    );
    if (!order) fail(404, "NOT_FOUND");
    return json(await getOrder(env.DB, order.id));
  }
  if (path.startsWith("/api/admin/")) {
    const account = await admin(request, env);
    if (!account) fail(401, "UNAUTHORIZED");
    if (path === "/api/admin/data" && method === "GET") {
      const [categories, products, orders, settings, deliveryRates, stats] =
        await Promise.all([
          all(env.DB, "SELECT * FROM categories ORDER BY sort_order,id"),
          all(
            env.DB,
            "SELECT * FROM products ORDER BY category_id,sort_order,id",
          ),
          all(
            env.DB,
            "SELECT id,order_number,customer_name,phone,governorate,total,currency,status,payment_status,payment_method,created_at FROM orders ORDER BY id DESC",
          ),
          getSettings(env.DB),
          all(env.DB, "SELECT * FROM delivery_rates ORDER BY governorate"),
          first(
            env.DB,
            "SELECT (SELECT COUNT(*) FROM orders) AS orders,(SELECT COALESCE(SUM(total),0) FROM orders WHERE status!='cancelled' AND payment_status='paid' AND currency=json_extract((SELECT value FROM settings WHERE id=1),'$.currency')) AS sales,(SELECT COUNT(*) FROM products WHERE stock<=CAST(json_extract((SELECT value FROM settings WHERE id=1),'$.low_stock_threshold') AS INTEGER)) AS lowStock",
          ),
        ]);
      return json({
        categories,
        products,
        orders,
        settings,
        deliveryRates,
        stats,
      });
    }
    if (path === "/api/admin/categories" && method === "POST")
      return saveCategory(request, env);
    if (path === "/api/admin/categories/reorder" && method === "POST")
      return reorder(request, env, "categories");
    const categoryMatch = path.match(/^\/api\/admin\/categories\/(\d+)$/);
    if (categoryMatch) {
      const id = Number(categoryMatch[1]);
      if (method === "PATCH") return saveCategory(request, env, id);
      if (method === "DELETE") return removeCategory(request, env, id);
    }
    if (path === "/api/admin/products" && method === "POST")
      return saveProduct(request, env);
    if (path === "/api/admin/products/reorder" && method === "POST")
      return reorder(request, env, "products");
    const productMatch = path.match(/^\/api\/admin\/products\/(\d+)$/);
    if (productMatch) {
      const id = Number(productMatch[1]);
      if (method === "PATCH") return saveProduct(request, env, id);
      if (method === "DELETE") {
        const result = await env.DB.prepare("DELETE FROM products WHERE id=?")
          .bind(id)
          .run();
        if (!result.meta.changes) fail(404, "NOT_FOUND");
        return json({ ok: true });
      }
    }
    const adminOrderMatch = path.match(/^\/api\/admin\/orders\/(\d+)$/);
    if (adminOrderMatch) {
      const id = Number(adminOrderMatch[1]);
      if (method === "GET") return json(await getOrder(env.DB, id));
      if (method === "PATCH") return updateOrder(request, env, id);
    }
    if (path === "/api/admin/images" && method === "POST")
      return uploadImage(request, env, account);
    if (path === "/api/admin/settings" && method === "PATCH")
      return saveSettings(request, env);
  }
  fail(404, "NOT_FOUND");
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try {
      response = await route(request, env);
    } catch (error) {
      if (error instanceof HttpError)
        response = json({ error: error.code }, error.status);
      else {
        console.error(
          "Request failed",
          error instanceof Error ? error.message : "unknown",
        );
        response = json({ error: "INTERNAL_ERROR" }, 500);
      }
    }
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Frame-Options", "DENY");
    if (new URL(request.url).pathname.startsWith("/api/"))
      headers.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
