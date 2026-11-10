import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { authFor, local } from "./auth";
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: string;
  APP_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  MAIL_API_KEY?: string;
  MAIL_FROM?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}
type Row = Record<string, any>;
type Identity = {
  id: string;
  email: string;
  role: string;
  disabled: number;
  twoFactorEnabled: number;
  emailVerified: number;
  passwordChangeRequired: number;
  sessionId: string;
  permissions: string[];
  mfa: boolean;
};
type App = { Bindings: Env; Variables: { actor: Identity } };
const app = new Hono<App>();
const permissions = [
  "categories.manage",
  "products.describe",
  "prices.edit",
  "stock.adjust",
  "orders.read",
  "orders.update",
] as const;
function fail(status: number, code: string): never {
  throw new HTTPException(status as 400, { message: code });
}
const all = async (db: D1Database, sql: string, ...args: any[]) =>
  (
    await db
      .prepare(sql)
      .bind(...args)
      .all<Row>()
  ).results;
const first = (db: D1Database, sql: string, ...args: any[]) =>
  db
    .prepare(sql)
    .bind(...args)
    .first<Row>();
const hash = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
const audit = (
  db: D1Database,
  actor: string,
  action: string,
  entity: string,
  id: string | number,
  details: unknown,
) =>
  db
    .prepare(
      "INSERT INTO audit_log(actor_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)",
    )
    .bind(actor, action, entity, String(id), JSON.stringify(details));
const int = z.number().int().min(0).max(100000000);
const txt = (max = 160) => z.string().trim().min(1).max(max);
const image = z
  .string()
  .max(1000)
  .refine(
    (v) => !v || /^\/samples\/[a-z-]+\.svg$/.test(v) || /^https:\/\//.test(v),
  );
const categorySchema = z
  .object({
    name_ar: txt(),
    name_en: txt(),
    image_url: image.optional(),
    visible: z.union([z.literal(0), z.literal(1)]).optional(),
    sort_order: int.optional(),
  })
  .strict();
const productSchema = categorySchema
  .extend({
    category_id: int.min(1),
    description_ar: z.string().max(10000).optional(),
    description_en: z.string().max(10000).optional(),
    price: int,
    stock: int.max(1000000),
    subject: z.string().max(160).optional(),
    academic_level: z.string().max(160).optional(),
    teacher_name: z.string().max(160).optional(),
  })
  .strict();
const cartSchema = z
  .array(
    z
      .object({ product_id: int.min(1), quantity: int.min(1).max(999) })
      .strict(),
  )
  .min(1)
  .max(40)
  .refine((v) => new Set(v.map((x) => x.product_id)).size === v.length);
const shippingSchema = z
  .object({
    customer_name: txt(),
    phone: z
      .string()
      .regex(/^[+\d\s()-]{7,40}$/)
      .refine((v) => v.replace(/\D/g, "").length >= 7),
    governorate: txt(80),
    area: txt(),
    address: txt(1000),
    notes: z.string().max(2000).default(""),
  })
  .strict();
async function parse<T extends z.ZodType>(
  c: Context<App>,
  schema: T,
): Promise<z.infer<T>> {
  try {
    return schema.parse(await c.req.json());
  } catch {
    return fail(400, "VALIDATION_ERROR");
  }
}
function can(u: Identity, p: string) {
  return u.role === "ADMIN" || u.permissions.includes(p);
}
function requirePermission(c: Context<App>, p: string) {
  const u = c.get("actor");
  if (!can(u, p)) fail(403, "FORBIDDEN");
  return u;
}
function requireAdmin(c: Context<App>) {
  const u = c.get("actor");
  if (u.role !== "ADMIN") fail(403, "FORBIDDEN");
  return u;
}
async function identity(c: Context<App>) {
  const s = await authFor(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!s) return fail(401, "UNAUTHORIZED");
  const u = await first(
    c.env.DB,
    "SELECT id,email,role,disabled,twoFactorEnabled,emailVerified,passwordChangeRequired FROM user WHERE id=?",
    s.user.id,
  );
  if (!u || u.disabled || !u.emailVerified)
    return fail(403, "ACCOUNT_DISABLED_OR_UNVERIFIED");
  const ps = await all(
    c.env.DB,
    "SELECT permission FROM staff_permissions WHERE user_id=?",
    u.id,
  );
  const proof = await first(
    c.env.DB,
    "SELECT verified_at FROM mfa_sessions WHERE session_id=?",
    s.session.id,
  );
  const actor = {
    ...u,
    sessionId: s.session.id,
    permissions: ps.map((p) => p.permission),
    mfa: !!proof && !!u.twoFactorEnabled,
  } as Identity;
  c.set("actor", actor);
  return actor;
}
async function limit(
  c: Context<App>,
  bucket: string,
  max: number,
  windowMs = 60000,
) {
  const key = await hash(
      `${bucket}|${c.req.header("CF-Connecting-IP") || "loopback"}`,
    ),
    now = Date.now();
  const r = await c.env.DB.prepare(
    "INSERT INTO auth_attempts(key,attempts,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END RETURNING attempts",
  )
    .bind(key, now, now - windowMs, now - windowMs)
    .first<Row>();
  if (r!.attempts > max) fail(429, "RATE_LIMITED");
}
app.use("*", async (c, next) => {
  const u = new URL(c.req.url),
    isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (local(c.env)) {
    if (!isLoopback) fail(403, "LOCAL_ONLY");
  } else {
    if (u.protocol !== "https:") fail(403, "HTTPS_REQUIRED");
    const team = c.env.ACCESS_TEAM_DOMAIN,
      aud = c.env.ACCESS_AUD;
    if (
      !team ||
      !aud ||
      !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)
    )
      fail(503, "ACCESS_NOT_CONFIGURED");
    const assertion = c.req.header("Cf-Access-Jwt-Assertion");
    if (!assertion) fail(403, "ACCESS_DENIED");
    try {
      await jwtVerify(
        assertion,
        createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`)),
        { issuer: team, audience: aud, algorithms: ["RS256"] },
      );
    } catch {
      fail(403, "ACCESS_DENIED");
    }
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    if (c.req.header("Origin") !== c.env.APP_ORIGIN) fail(403, "CSRF_REJECTED");
    const site = c.req.header("Sec-Fetch-Site");
    if (site && site !== "same-origin" && site !== "none")
      fail(403, "CSRF_REJECTED");
    if (!c.req.header("Content-Type")?.includes("application/json"))
      fail(415, "JSON_REQUIRED");
    const raw = await c.req.raw.clone().arrayBuffer();
    if (raw.byteLength > 65536) fail(413, "BODY_TOO_LARGE");
  }
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  c.header(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self'${local(c.env) ? " 'unsafe-inline'" : ""}; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' https: data:; connect-src 'self'${local(c.env) ? " ws://127.0.0.1:5173" : ""}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
  );
  if (!local(c.env))
    c.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  if (u.pathname.startsWith("/api/")) c.header("Cache-Control", "no-store");
});
app.get("/api/health", async (c) => {
  await first(c.env.DB, "SELECT 1");
  return c.json({
    ok: true,
    database: "D1",
    checkout: "demo",
    auth: "Better Auth",
  });
});
app.get("/api/local/mail", async (c) => {
  if (!local(c.env)) fail(404, "NOT_FOUND");
  return c.json({
    messages: await all(
      c.env.DB,
      "SELECT subject,url FROM mail_outbox WHERE recipient=? ORDER BY rowid DESC",
      c.req.query("email") || "",
    ),
  });
});
app.all("/api/auth/*", async (c) => {
  let request = c.req.raw;
  let changingPasswordFor: string | undefined;
  const path = new URL(c.req.url).pathname
    .slice("/api/auth".length)
    .replace(/\/+$/, "");
  if (c.req.method === "POST") {
    await limit(c, "auth-ip", 30);
    if (
      [
        "/sign-in/email",
        "/sign-up/email",
        "/request-password-reset",
        "/send-verification-email",
        "/reset-password",
      ].includes(path)
    ) {
      await limit(c, `sensitive:${path}`, 5, 15 * 60 * 1000);
      const b = (await c.req.raw.clone().json()) as Row;
      if (
        [
          "role",
          "permissions",
          "disabled",
          "emailVerified",
          "twoFactorEnabled",
          "loginName",
          "passwordChangeRequired",
        ].some((k) => k in b)
      )
        fail(400, "PROTECTED_FIELD");
    }
    if (path === "/update-user") {
      const b = (await c.req.raw.clone().json()) as Row;
      if (Object.keys(b).some((k) => !["name", "image"].includes(k)))
        fail(400, "PROTECTED_FIELD");
    }
    if (path === "/sign-in/email") {
      const b = (await request.clone().json()) as Row;
      // Resolve only the explicitly provisioned administrator alias. Better Auth
      // still verifies the password, email, and factor and creates the session.
      const user = await first(
        c.env.DB,
        "SELECT email,disabled FROM user WHERE email=? COLLATE NOCASE OR (loginName=? COLLATE NOCASE AND role='ADMIN' AND emailVerified=1)",
        String(b.email || ""),
        String(b.email || ""),
      );
      if (user?.disabled) fail(401, "INVALID_EMAIL_OR_PASSWORD");
      if (user) {
        request = new Request(request, {
          body: JSON.stringify({ ...b, email: user.email }),
        });
      }
    }
    if (path === "/change-password") {
      const u = await identity(c);
      if (u.passwordChangeRequired) changingPasswordFor = u.id;
    }
    if (path.startsWith("/two-factor/verify-"))
      await limit(c, "factor", 8, 5 * 60 * 1000);
    if (path === "/two-factor/disable") {
      const s = await authFor(c.env).api.getSession({
        headers: c.req.raw.headers,
      });
      if (s)
        await c.env.DB.prepare(
          "DELETE FROM mfa_sessions WHERE session_id IN (SELECT id FROM session WHERE userId=?)",
        )
          .bind(s.user.id)
          .run();
    }
  }
  const auth = authFor(c.env),
    r = await auth.handler(request);
  if (r.ok && changingPasswordFor) {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE user SET passwordChangeRequired=0 WHERE id=?",
      ).bind(changingPasswordFor),
      audit(
        c.env.DB,
        changingPasswordFor,
        "account.initial-password-changed",
        "user",
        changingPasswordFor,
        {},
      ),
    ]);
  }
  if (
    r.ok &&
    c.req.method === "POST" &&
    ["/two-factor/verify-totp", "/two-factor/verify-backup-code"].includes(path)
  ) {
    // Use Better Auth's freshly rotated signed cookie only after factor verification succeeds.
    const h = new Headers(c.req.raw.headers),
      cookies = new Map(
        (h.get("Cookie") || "")
          .split(";")
          .filter(Boolean)
          .map((v) => {
            const n = v.indexOf("=");
            return [v.slice(0, n).trim(), v.slice(n + 1)];
          }),
      );
    for (const v of r.headers.getSetCookie()) {
      const pair = v.split(";")[0],
        n = pair.indexOf("=");
      cookies.set(pair.slice(0, n), pair.slice(n + 1));
    }
    h.set("Cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const s = await auth.api.getSession({ headers: h });
    if (s)
      await c.env.DB.prepare(
        "INSERT INTO mfa_sessions(session_id,verified_at) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET verified_at=excluded.verified_at",
      )
        .bind(s.session.id, Date.now())
        .run();
  }
  return r;
});
app.get("/api/store", async (c) => {
  const [s, categories, products, deliveryRates] = await Promise.all([
    first(c.env.DB, "SELECT value FROM settings WHERE id=1"),
    all(
      c.env.DB,
      "SELECT * FROM categories WHERE visible=1 ORDER BY sort_order,id",
    ),
    all(
      c.env.DB,
      "SELECT p.* FROM products p JOIN categories c ON c.id=p.category_id WHERE p.visible=1 AND c.visible=1 ORDER BY c.sort_order,p.sort_order,p.id",
    ),
    all(c.env.DB, "SELECT * FROM delivery_rates ORDER BY governorate"),
  ]);
  return c.json({
    settings: {
      ...JSON.parse(s!.value),
      currency: "IQD",
      default_language: "ar",
    },
    categories,
    products,
    deliveryRates,
  });
});
app.use("/api/me/*", async (c, next) => {
  await identity(c);
  await next();
});
app.get("/api/me/session", (c) => c.json({ user: c.get("actor") }));
app.use("/api/checkout/*", async (c, next) => {
  await identity(c);
  await next();
});
app.post("/api/checkout/quote", async (c) => {
  await limit(c, "quote", 40);
  const b = await parse(
      c,
      z.object({ items: cartSchema, governorate: txt(80) }).strict(),
    ),
    items = [];
  for (const x of [...b.items].sort((a, b) => a.product_id - b.product_id)) {
    const p = await first(
      c.env.DB,
      "SELECT p.* FROM products p JOIN categories c ON p.category_id=c.id WHERE p.id=? AND p.visible=1 AND c.visible=1",
      x.product_id,
    );
    if (!p || p.stock < x.quantity) fail(409, "STOCK_CHANGED");
    items.push({
      product_id: p.id,
      quantity: x.quantity,
      price: p.price,
      name_ar: p.name_ar,
      name_en: p.name_en,
      image_url: p.image_url,
    });
  }
  const rate = await first(
    c.env.DB,
    "SELECT fee FROM delivery_rates WHERE governorate=? AND enabled=1",
    b.governorate,
  );
  if (!rate) fail(400, "DELIVERY_UNAVAILABLE");
  const subtotal = items.reduce((sum, x) => sum + x.price * x.quantity, 0),
    quote = {
      items,
      governorate: b.governorate,
      subtotal,
      delivery_fee: rate.fee,
      total: subtotal + rate.fee,
      currency: "IQD",
    };
  const id = crypto.randomUUID(),
    expires_at = Date.now() + 10 * 60 * 1000;
  await c.env.DB.prepare("INSERT INTO checkout_quotes VALUES(?,?,?,?)")
    .bind(id, c.get("actor").id, JSON.stringify(quote), expires_at)
    .run();
  return c.json({ id, expires_at, ...quote });
});
async function order(db: D1Database, id: number) {
  const o = await first(db, "SELECT * FROM orders WHERE id=?", id);
  if (!o) fail(404, "NOT_FOUND");
  const { request_hash, idempotency_key, access_token_hash, ...safe } = o;
  return {
    order: safe,
    items: await all(
      db,
      "SELECT * FROM order_items WHERE order_id=? ORDER BY id",
      id,
    ),
  };
}
app.use("/api/orders", async (c, next) => {
  await identity(c);
  await next();
});
app.use("/api/orders/*", async (c, next) => {
  await identity(c);
  await next();
});
app.get("/api/orders", async (c) =>
  c.json({
    orders: await all(
      c.env.DB,
      "SELECT id,order_number,total,currency,status,created_at FROM orders WHERE customer_id=? ORDER BY id DESC LIMIT 200",
      c.get("actor").id,
    ),
  }),
);
app.get("/api/orders/:id", async (c) => {
  const o = await first(
    c.env.DB,
    "SELECT id FROM orders WHERE id=? AND customer_id=?",
    c.req.param("id"),
    c.get("actor").id,
  );
  if (!o) fail(404, "NOT_FOUND");
  return c.json(await order(c.env.DB, o.id));
});
app.post("/api/orders", async (c) => {
  await limit(c, "confirm", 30);
  const b = await parse(
      c,
      z
        .object({
          idempotency_key: z.string().uuid(),
          quote_id: z.string().uuid(),
          shipping: shippingSchema,
        })
        .strict(),
    ),
    u = c.get("actor");
  const requestHash = await hash(
    JSON.stringify({ user: u.id, quote: b.quote_id, shipping: b.shipping }),
  );
  const retry = async () => {
    const keyOrder = await first(
      c.env.DB,
      "SELECT id,customer_id,request_hash FROM orders WHERE idempotency_key=?",
      b.idempotency_key,
    );
    const claim = await first(
      c.env.DB,
      "SELECT order_id AS id,customer_id,request_hash FROM checkout_claims WHERE quote_id=?",
      b.quote_id,
    );
    if (
      keyOrder &&
      (keyOrder.customer_id !== u.id || keyOrder.request_hash !== requestHash)
    )
      fail(409, "IDEMPOTENCY_CONFLICT");
    const e = claim || keyOrder;
    if (!e) return null;
    if (e.customer_id !== u.id || e.request_hash !== requestHash)
      fail(409, "IDEMPOTENCY_CONFLICT");
    return order(c.env.DB, e.id);
  };
  const existing = await retry();
  if (existing) return c.json(existing);
  const q = await first(
    c.env.DB,
    "SELECT payload,expires_at FROM checkout_quotes WHERE id=? AND user_id=?",
    b.quote_id,
    u.id,
  );
  if (!q || q.expires_at <= Date.now()) fail(409, "QUOTE_EXPIRED");
  const v = JSON.parse(q.payload),
    s = b.shipping;
  if (s.governorate !== v.governorate) fail(400, "ZONE_MISMATCH");
  const number = `MKT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const statements = [
    c.env.DB.prepare(
      "INSERT INTO orders(order_number,idempotency_key,request_hash,access_token_hash,customer_name,phone,governorate,area,address,notes,subtotal,delivery_fee,total,currency,customer_id,quote_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      number,
      b.idempotency_key,
      requestHash,
      "",
      s.customer_name,
      s.phone,
      s.governorate,
      s.area,
      s.address,
      s.notes,
      v.subtotal,
      v.delivery_fee,
      v.total,
      "IQD",
      u.id,
      b.quote_id,
    ),
  ];
  for (const x of v.items) {
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO order_items(order_id,product_id,name_ar,name_en,price,quantity,image_url) VALUES((SELECT id FROM orders WHERE idempotency_key=?),?,?,?,?,?,?)",
      ).bind(
        b.idempotency_key,
        x.product_id,
        x.name_ar,
        x.name_en,
        x.price,
        x.quantity,
        x.image_url,
      ),
    );
    statements.push(
      audit(c.env.DB, u.id, "stock.reserved", "products", x.product_id, {
        order: number,
        delta: -x.quantity,
      }),
    );
  }
  statements.push(
    audit(c.env.DB, u.id, "order.created", "orders", number, {
      demo: true,
      total: v.total,
    }),
  );
  try {
    await c.env.DB.batch(statements);
  } catch (e) {
    const same = await retry();
    if (same) return c.json(same);
    if (/STOCK_CHANGED|STORE_CHANGED|QUOTE_EXPIRED/.test(String(e)))
      fail(409, "QUOTE_OR_STOCK_CHANGED");
    throw e;
  }
  return c.json((await retry())!, 201);
});
app.use("/api/admin/*", async (c, next) => {
  const u = await identity(c);
  if (!["ADMIN", "STAFF"].includes(u.role)) fail(403, "FORBIDDEN");
  if (u.passwordChangeRequired) fail(403, "PASSWORD_CHANGE_REQUIRED");
  if (!u.mfa) fail(403, "TWO_FACTOR_REQUIRED");
  await next();
});
app.get("/api/admin/data", async (c) => {
  const u = c.get("actor"),
    db = c.env.DB;
  if (u.role === "STAFF" && !u.permissions.length) fail(403, "NO_PERMISSIONS");
  const [categories, products, orders, s, deliveryRates] = await Promise.all([
    all(db, "SELECT * FROM categories ORDER BY sort_order,id"),
    all(db, "SELECT * FROM products ORDER BY category_id,sort_order,id"),
    can(u, "orders.read")
      ? all(
          db,
          "SELECT id,order_number,customer_name,status,total FROM orders ORDER BY id DESC LIMIT 500",
        )
      : [],
    first(db, "SELECT value FROM settings WHERE id=1"),
    all(db, "SELECT * FROM delivery_rates ORDER BY governorate"),
  ]);
  return c.json({
    categories,
    products,
    orders,
    settings: JSON.parse(s!.value),
    deliveryRates,
  });
});
app.post("/api/admin/categories", async (c) => {
  const u = requirePermission(c, "categories.manage"),
    b = await parse(c, categorySchema),
    keys = Object.keys(b);
  const r = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO categories(${keys.join(",")}) VALUES(${keys.map(() => "?")})`,
    ).bind(...Object.values(b)),
    audit(c.env.DB, u.id, "category.created", "categories", "new", b),
  ]);
  return c.json({ id: r[0].meta.last_row_id }, 201);
});
app.patch("/api/admin/categories/:id", async (c) => {
  const u = requirePermission(c, "categories.manage"),
    b = await parse(c, categorySchema.partial());
  if (!Object.keys(b).length) fail(400, "VALIDATION_ERROR");
  const keys = Object.keys(b),
    id = c.req.param("id");
  if (!(await first(c.env.DB, "SELECT id FROM categories WHERE id=?", id)))
    fail(404, "NOT_FOUND");
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE categories SET ${keys.map((k) => `${k}=?`)} WHERE id=?`,
    ).bind(...Object.values(b), id),
    audit(c.env.DB, u.id, "category.updated", "categories", id, b),
  ]);
  return c.json({ ok: true });
});
app.delete("/api/admin/categories/:id", async (c) => {
  const u = requirePermission(c, "categories.manage"),
    id = c.req.param("id");
  if (!(await first(c.env.DB, "SELECT id FROM categories WHERE id=?", id)))
    fail(404, "NOT_FOUND");
  if (
    await first(
      c.env.DB,
      "SELECT id FROM products WHERE category_id=? LIMIT 1",
      id,
    )
  )
    fail(409, "CATEGORY_NOT_EMPTY");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM categories WHERE id=?").bind(id),
    audit(c.env.DB, u.id, "category.deleted", "categories", id, {}),
  ]);
  return c.json({ ok: true });
});
app.post("/api/admin/products", async (c) => {
  const u = requireAdmin(c),
    b = await parse(c, productSchema),
    keys = Object.keys(b);
  if (
    !(await first(
      c.env.DB,
      "SELECT id FROM categories WHERE id=?",
      b.category_id,
    ))
  )
    fail(400, "INVALID_CATEGORY");
  const r = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO products(${keys.join(",")}) VALUES(${keys.map(() => "?")})`,
    ).bind(...Object.values(b)),
    audit(c.env.DB, u.id, "product.created", "products", "new", b),
  ]);
  return c.json({ id: r[0].meta.last_row_id }, 201);
});
app.patch("/api/admin/products/:id", async (c) => {
  const u = c.get("actor"),
    input = await parse(
      c,
      productSchema
        .partial()
        .extend({ expected_stock: int.max(1000000).optional() }),
    ),
    { expected_stock, ...b } = input,
    keys = Object.keys(b),
    id = c.req.param("id");
  if (!keys.length) fail(400, "VALIDATION_ERROR");
  for (const k of keys) {
    const p =
      k === "price"
        ? "prices.edit"
        : k === "stock"
          ? "stock.adjust"
          : ["category_id", "visible", "sort_order"].includes(k)
            ? "ADMIN"
            : "products.describe";
    if (p === "ADMIN") requireAdmin(c);
    else requirePermission(c, p);
  }
  if ((b.stock !== undefined) !== (expected_stock !== undefined))
    fail(400, "EXPECTED_STOCK_REQUIRED");
  const old = await first(c.env.DB, "SELECT * FROM products WHERE id=?", id);
  if (!old) fail(404, "NOT_FOUND");
  if (
    b.category_id !== undefined &&
    !(await first(
      c.env.DB,
      "SELECT id FROM categories WHERE id=?",
      b.category_id,
    ))
  )
    fail(400, "INVALID_CATEGORY");
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE products SET ${keys.map((k) => `${k}=?`).join(",")},updated_at=datetime('now') WHERE id=?${b.stock !== undefined ? " AND stock=?" : ""}`,
    ).bind(
      ...Object.values(b),
      id,
      ...(b.stock !== undefined ? [expected_stock] : []),
    ),
    c.env.DB.prepare(
      "INSERT INTO audit_log(actor_id,action,entity,entity_id,details) SELECT ?,'product.updated','products',?,? WHERE changes()=1",
    ).bind(
      u.id,
      id,
      JSON.stringify({
        before: Object.fromEntries(keys.map((k) => [k, old[k]])),
        after: b,
      }),
    ),
  ]);
  if (!result[0].meta.changes) fail(409, "STOCK_CHANGED");
  return c.json({ ok: true });
});
app.delete("/api/admin/products/:id", async (c) => {
  const u = requireAdmin(c),
    id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE products SET visible=0 WHERE id=?").bind(id),
    audit(c.env.DB, u.id, "product.archived", "products", id, {}),
  ]);
  return c.json({ ok: true });
});
app.get("/api/admin/orders/:id", async (c) => {
  requirePermission(c, "orders.read");
  return c.json(await order(c.env.DB, Number(c.req.param("id"))));
});
app.patch("/api/admin/orders/:id", async (c) => {
  const u = requirePermission(c, "orders.update"),
    b = await parse(
      c,
      z
        .object({
          status: z.enum([
            "new",
            "preparing",
            "shipped",
            "completed",
            "cancelled",
          ]),
        })
        .strict(),
    ),
    id = c.req.param("id");
  const old = await first(c.env.DB, "SELECT status FROM orders WHERE id=?", id);
  if (!old) fail(404, "NOT_FOUND");
  if (old.status === b.status) return c.json({ ok: true });
  const operation = crypto.randomUUID();
  try {
    const r = await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE orders SET status=?,updated_at=datetime('now') WHERE id=? AND status=?",
      ).bind(b.status, id, old.status),
      c.env.DB.prepare(
        "INSERT INTO audit_log(actor_id,action,entity,entity_id,details) SELECT ?,'order.status','orders',?,? WHERE changes()=1",
      ).bind(
        u.id,
        id,
        JSON.stringify({ from: old.status, to: b.status, operation }),
      ),
      c.env.DB.prepare(
        "INSERT INTO audit_log(actor_id,action,entity,entity_id,details) SELECT ?,'stock.restored','products',CAST(product_id AS TEXT),json_object('order',order_id,'delta',quantity) FROM order_items WHERE order_id=? AND product_id IS NOT NULL AND ?='cancelled' AND EXISTS(SELECT 1 FROM audit_log WHERE action='order.status' AND json_extract(details,'$.operation')=?)",
      ).bind(u.id, id, b.status, operation),
    ]);
    if (!r[0].meta.changes) fail(409, "STATUS_CHANGED");
  } catch (e) {
    if (String(e).includes("INVALID_STATUS")) fail(409, "INVALID_STATUS");
    throw e;
  }
  return c.json({ ok: true });
});
app.post("/api/admin/zones", async (c) => {
  const u = requireAdmin(c),
    b = await parse(
      c,
      z
        .object({
          governorate: txt(80),
          fee: int.max(10000000),
          enabled: z.union([z.literal(0), z.literal(1)]),
        })
        .strict(),
    );
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO delivery_rates VALUES(?,?,?) ON CONFLICT(governorate) DO UPDATE SET fee=excluded.fee,enabled=excluded.enabled",
    ).bind(b.governorate, b.fee, b.enabled),
    audit(c.env.DB, u.id, "delivery.updated", "zones", b.governorate, b),
  ]);
  return c.json({ ok: true });
});
app.get("/api/admin/users", async (c) => {
  requireAdmin(c);
  const users = await all(
    c.env.DB,
    "SELECT id,name,email,role,disabled,twoFactorEnabled FROM user ORDER BY createdAt DESC",
  );
  const grants = await all(c.env.DB, "SELECT * FROM staff_permissions");
  return c.json({
    users: users.map((u) => ({
      ...u,
      permissions: grants
        .filter((g) => g.user_id === u.id)
        .map((g) => g.permission),
    })),
    permissions,
  });
});
app.patch("/api/admin/users/:id", async (c) => {
  const u = requireAdmin(c),
    id = c.req.param("id"),
    b = await parse(
      c,
      z
        .object({
          role: z.enum(["CUSTOMER", "STAFF"]),
          disabled: z.boolean(),
          permissions: z
            .array(z.enum(permissions))
            .max(6)
            .refine((v) => new Set(v).size === v.length),
        })
        .strict(),
    );
  const target = await first(c.env.DB, "SELECT role FROM user WHERE id=?", id);
  if (!target) fail(404, "NOT_FOUND");
  if (target.role === "ADMIN" || id === u.id)
    fail(403, "ADMIN_ACCOUNT_PROTECTED");
  if (b.role !== "STAFF" && b.permissions.length) fail(400, "VALIDATION_ERROR");
  if (target.role !== "STAFF" && b.role === "STAFF" && b.permissions.length)
    fail(400, "STAFF_STARTS_EMPTY");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE user SET role=?,disabled=? WHERE id=?").bind(
      b.role,
      Number(b.disabled),
      id,
    ),
    c.env.DB.prepare("DELETE FROM staff_permissions WHERE user_id=?").bind(id),
    ...b.permissions.map((p) =>
      c.env.DB.prepare("INSERT INTO staff_permissions VALUES(?,?)").bind(id, p),
    ),
    audit(c.env.DB, u.id, "permissions.updated", "user", id, b),
  ]);
  return c.json({ ok: true });
});
app.get("/api/admin/audit", async (c) => {
  requireAdmin(c);
  return c.json({
    entries: await all(
      c.env.DB,
      "SELECT * FROM audit_log ORDER BY id DESC LIMIT 500",
    ),
  });
});
app.get("/api/*", () => fail(404, "NOT_FOUND"));
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((e, c) => {
  if (e instanceof HTTPException) return c.json({ error: e.message }, e.status);
  console.error("Request failed", String(e));
  return c.json({ error: "INTERNAL_ERROR" }, 500);
});
export default app;
