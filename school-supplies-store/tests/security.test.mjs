import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHmac, randomUUID } from "node:crypto";
const origin = "http://127.0.0.1:5173",
  password = "Fictional-demo-password-842!";
let mf,
  db,
  dir,
  admin,
  alice,
  bob,
  staff,
  ip = 1;
const shipping = {
  customer_name: "Fictional Student",
  phone: "07000000000",
  governorate: "Baghdad",
  area: "Demo district",
  address: "Imaginary street 12",
  notes: "",
};
class Client {
  cookies = new Map();
  ip = `192.0.2.${ip++}`;
  async call(path, method = "GET", body, extra = {}) {
    const headers = { Origin: origin, "CF-Connecting-IP": this.ip, ...extra };
    if (this.cookies.size)
      headers.Cookie = [...this.cookies]
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const r = await mf.dispatchFetch(origin + path, {
      method,
      headers,
      redirect: "manual",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    for (const v of r.headers.getSetCookie()) {
      const pair = v.split(";")[0],
        n = pair.indexOf("=");
      this.cookies.set(pair.slice(0, n), pair.slice(n + 1));
    }
    const data = await r
      .clone()
      .json()
      .catch(() => null);
    return { r, data, status: r.status };
  }
  async ok(path, method = "GET", body) {
    const v = await this.call(path, method, body);
    assert.ok(
      v.r.ok,
      `${method} ${path}: ${v.status} ${JSON.stringify(v.data)}`,
    );
    return v.data;
  }
}
async function register(name) {
  const c = new Client(),
    email = `${name}-${randomUUID()}@example.test`;
  c.email = email;
  await c.ok("/api/auth/sign-up/email", "POST", {
    name,
    email,
    password,
    callbackURL: origin + "/account",
  });
  const mail = await db
    .prepare(
      "SELECT url FROM mail_outbox WHERE recipient=? ORDER BY rowid DESC LIMIT 1",
    )
    .bind(email)
    .first();
  assert.ok(mail);
  const verify = await c.call(
    new URL(mail.url).pathname + new URL(mail.url).search,
  );
  assert.ok(verify.status < 400, JSON.stringify(verify.data));
  await c.ok("/api/auth/sign-in/email", "POST", { email, password });
  c.user = (await c.ok("/api/me/session")).user;
  return c;
}
function totp(uri) {
  const base32 = new URL(uri).searchParams.get("secret").toUpperCase(),
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32.replace(/=/g, ""))
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes))
      .update(counter)
      .digest(),
    offset = digest.at(-1) & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
async function enroll(c) {
  const setup = await c.ok("/api/auth/two-factor/enable", "POST", { password });
  c.uri = setup.totpURI;
  c.backups = setup.backupCodes;
  await c.ok("/api/auth/two-factor/verify-totp", "POST", {
    code: totp(c.uri),
    trustDevice: false,
  });
  assert.equal((await c.ok("/api/me/session")).user.mfa, true);
}
async function login(c) {
  const result = await c.ok("/api/auth/sign-in/email", "POST", {
    email: c.email,
    password,
  });
  if (result.twoFactorRedirect)
    await c.ok("/api/auth/two-factor/verify-totp", "POST", {
      code: totp(c.uri),
      trustDevice: false,
    });
}
async function product(stock = 10, price = 1500) {
  const p = await admin.ok("/api/admin/products", "POST", {
    category_id: 1,
    name_ar: "منتج اختبار خيالي " + randomUUID().slice(0, 6),
    name_en: "Fictional test " + randomUUID().slice(0, 6),
    price,
    stock,
    image_url: "/samples/notebook.svg",
  });
  return p.id;
}
async function quote(c, id, quantity = 1) {
  return c.ok("/api/checkout/quote", "POST", {
    items: [{ product_id: id, quantity }],
    governorate: "Baghdad",
  });
}
const confirm = (q) => ({
  idempotency_key: randomUUID(),
  quote_id: q.id,
  shipping,
});
async function stock(id) {
  return (
    await db.prepare("SELECT stock FROM products WHERE id=?").bind(id).first()
  ).stock;
}
before(
  async () => {
    dir = mkdtempSync(join(tmpdir(), "maktabati-api-"));
    mf = new Miniflare(
      convertV4MiniflareOptions({
        modulesRoot: resolve("dist/school_supplies_store"),
        modules: [
          "index.js",
          ...readdirSync("dist/school_supplies_store/assets")
            .filter((f) => f.endsWith(".js"))
            .map((f) => "assets/" + f),
        ].map((f) => ({
          type: "ESModule",
          path: resolve("dist/school_supplies_store", f),
        })),
        compatibilityDate: "2026-10-24",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: {
          DB: "isolated-tests",
          UPGRADE: "isolated-upgrade-tests",
        },
        bindings: {
          APP_ENV: "local",
          APP_ORIGIN: origin,
          BETTER_AUTH_SECRET:
            "isolated-test-secret-very-long-random-enough-123456",
        },
        serviceBindings: {
          ASSETS: () =>
            new Response("<html>private asset</html>", {
              headers: { "Content-Type": "text/html" },
            }),
        },
      }),
    );
    db = await mf.getD1Database("DB");
    for (const path of [
      "migrations/0001_store.sql",
      "migrations/0002_identity_and_checkout.sql",
      "migrations/0003_release_integrity.sql",
    ])
      await db.exec(
        readFileSync(path, "utf8")
          .replace(/--[^\n]*/g, "")
          .replace(/\r?\n/g, " "),
      );
    admin = await register("admin");
    alice = await register("alice");
    bob = await register("bob");
    staff = await register("staff");
    await db
      .prepare("UPDATE user SET role='ADMIN' WHERE id=?")
      .bind(admin.user.id)
      .run();
    await login(admin);
    await enroll(admin);
  },
  { timeout: 120000 },
);
after(async () => {
  await mf?.dispose();
  if (dir) rmSync(dir, { recursive: true, force: true });
});
test("customer and anonymous direct API requests cannot reach internal routes", async () => {
  assert.equal((await new Client().call("/api/admin/data")).status, 401);
  for (const [path, method, body] of [
    ["/api/admin/data", "GET"],
    ["/api/admin/products/1", "PATCH", { price: 1 }],
    ["/api/admin/users", "GET"],
    ["/api/admin/audit", "GET"],
  ])
    assert.equal((await alice.call(path, method, body)).status, 403);
  assert.equal((await new Client().call("/api/orders")).status, 401);
});
test("registration and profile edits reject role and factor injection", async () => {
  const c = new Client();
  assert.equal(
    (
      await c.call("/api/auth/sign-up/email", "POST", {
        name: "Evil",
        email: "evil@example.test",
        password,
        role: "ADMIN",
      })
    ).status,
    400,
  );
  for (const patch of [
    { role: "ADMIN" },
    { permissions: ["prices.edit"] },
    { emailVerified: true },
    { twoFactorEnabled: true },
  ])
    assert.equal(
      (await alice.call("/api/auth/update-user", "POST", patch)).status,
      400,
    );
  assert.equal((await alice.ok("/api/me/session")).user.role, "CUSTOMER");
});
test("staff promotion starts empty; enrollment and session factor are mandatory", async () => {
  assert.equal(
    (
      await admin.call("/api/admin/users/" + staff.user.id, "PATCH", {
        role: "STAFF",
        disabled: false,
        permissions: ["prices.edit"],
      })
    ).status,
    400,
  );
  await admin.ok("/api/admin/users/" + staff.user.id, "PATCH", {
    role: "STAFF",
    disabled: false,
    permissions: [],
  });
  await login(staff);
  assert.equal(
    (await staff.call("/api/admin/data")).data.error,
    "TWO_FACTOR_REQUIRED",
  );
  assert.equal(
    (
      await staff.call("/api/auth/two-factor/verify-totp", "POST", {
        code: "000000",
        trustDevice: false,
      })
    ).r.ok,
    false,
  );
  assert.equal(
    (await staff.call("/api/admin/products/1", "PATCH", { price: 1 })).status,
    403,
  );
  await enroll(staff);
  const p = await product();
  assert.equal(
    (await staff.call("/api/admin/products/" + p, "PATCH", { price: 1 }))
      .status,
    403,
  );
  assert.equal((await staff.call("/api/admin/users")).status, 403);
});
test("separate staff permissions and revocation apply during the same active session", async () => {
  const p = await product();
  await admin.ok("/api/admin/users/" + staff.user.id, "PATCH", {
    role: "STAFF",
    disabled: false,
    permissions: ["prices.edit"],
  });
  await staff.ok("/api/admin/products/" + p, "PATCH", { price: 2000 });
  assert.equal(
    (
      await staff.call("/api/admin/products/" + p, "PATCH", {
        price: 2000,
        stock: 99,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await staff.call("/api/admin/products/" + p, "PATCH", {
        description_en: "changed",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await staff.call("/api/admin/categories", "POST", {
        name_ar: "قسم",
        name_en: "Category",
      })
    ).status,
    403,
  );
  assert.equal((await staff.ok("/api/admin/data")).orders.length, 0);
  await admin.ok("/api/admin/users/" + staff.user.id, "PATCH", {
    role: "STAFF",
    disabled: false,
    permissions: [],
  });
  assert.equal(
    (await staff.call("/api/admin/products/" + p, "PATCH", { price: 1 }))
      .status,
    403,
  );
  await admin.ok("/api/admin/users/" + staff.user.id, "PATCH", {
    role: "CUSTOMER",
    disabled: false,
    permissions: [],
  });
  assert.equal((await staff.call("/api/admin/data")).status, 401);
  await admin.ok("/api/admin/users/" + staff.user.id, "PATCH", {
    role: "STAFF",
    disabled: false,
    permissions: [],
  });
  await login(staff);
});
test("server quote rejects injected prices, totals, fees and unexpected fields", async () => {
  const p = await product(),
    q = await quote(alice, p, 2);
  assert.equal(q.subtotal, 3000);
  assert.equal(q.delivery_fee, 5000);
  assert.equal(q.total, 8000);
  assert.equal(
    (
      await alice.call("/api/checkout/quote", "POST", {
        items: [{ product_id: p, quantity: 1, price: 1 }],
        governorate: "Baghdad",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await alice.call("/api/orders", "POST", {
        ...confirm(q),
        total: 1,
        delivery_fee: 0,
      })
    ).status,
    400,
  );
  assert.equal(await stock(p), 10);
});
test("repeated confirmation returns the same customer-owned order and immutable snapshots", async () => {
  const p = await product(),
    q = await quote(alice, p, 2),
    body = confirm(q),
    a = await alice.ok("/api/orders", "POST", body),
    b = await alice.ok("/api/orders", "POST", body);
  assert.equal(a.order.id, b.order.id);
  assert.equal(await stock(p), 8);
  assert.equal(a.items[0].price, 1500);
  assert.equal(a.order.delivery_fee, 5000);
  assert.equal(a.order.address, shipping.address);
  assert.equal(
    (
      await alice.call("/api/orders", "POST", {
        ...body,
        shipping: { ...shipping, address: "Other address" },
      })
    ).status,
    409,
  );
  assert.equal((await bob.call("/api/orders/" + a.order.id)).status, 404);
  assert.equal(
    (
      await bob.call(
        "/api/orders/" + a.order.id + "?token=" + body.idempotency_key,
      )
    ).status,
    404,
  );
  assert.ok(
    (await alice.ok("/api/orders")).orders.some((o) => o.id === a.order.id),
  );
  await admin.ok("/api/admin/products/" + p, "PATCH", { price: 2222 });
  assert.equal(
    (await alice.ok("/api/orders/" + a.order.id)).items[0].price,
    1500,
  );
});
test("a price or delivery fee changed after review rolls back the complete D1 batch", async () => {
  const p = await product(),
    q = await quote(alice, p),
    body = confirm(q);
  await admin.ok("/api/admin/products/" + p, "PATCH", { price: 3000 });
  assert.equal((await alice.call("/api/orders", "POST", body)).status, 409);
  assert.equal(await stock(p), 10);
  assert.equal(
    await db
      .prepare("SELECT id FROM orders WHERE idempotency_key=?")
      .bind(body.idempotency_key)
      .first(),
    null,
  );
  const q2 = await quote(alice, p),
    b2 = confirm(q2);
  await admin.ok("/api/admin/zones", "POST", {
    governorate: "Baghdad",
    fee: 6000,
    enabled: 1,
  });
  assert.equal((await alice.call("/api/orders", "POST", b2)).status, 409);
  assert.equal(await stock(p), 10);
  await admin.ok("/api/admin/zones", "POST", {
    governorate: "Baghdad",
    fee: 5000,
    enabled: 1,
  });
});
test("two simultaneous purchases of the final unit yield exactly one order", async () => {
  const p = await product(1),
    q1 = await quote(alice, p),
    q2 = await quote(bob, p),
    b1 = confirm(q1),
    b2 = confirm(q2);
  const r = await Promise.all([
    alice.call("/api/orders", "POST", b1),
    bob.call("/api/orders", "POST", b2),
  ]);
  assert.deepEqual(r.map((x) => x.status).sort(), [201, 409]);
  assert.equal(await stock(p), 0);
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM order_items WHERE product_id=?")
    .bind(p)
    .first();
  assert.equal(count.n, 1);
});
test("simultaneous identical confirmations reserve stock once", async () => {
  const p = await product(2),
    q = await quote(alice, p),
    body = confirm(q),
    r = await Promise.all([
      alice.call("/api/orders", "POST", body),
      alice.call("/api/orders", "POST", body),
    ]);
  assert.ok(
    r.every((x) => x.r.ok),
    JSON.stringify(r.map((x) => x.data)),
  );
  assert.equal(r[0].data.order.id, r[1].data.order.id);
  assert.equal(await stock(p), 1);
});
test("multi-item insufficient stock rolls back earlier reservations and order insertion", async () => {
  const p = await product(4),
    p2 = await product(1),
    q = await alice.ok("/api/checkout/quote", "POST", {
      items: [
        { product_id: p, quantity: 2 },
        { product_id: p2, quantity: 1 },
      ],
      governorate: "Baghdad",
    }),
    body = confirm(q);
  await admin.ok("/api/admin/products/" + p2, "PATCH", {
    stock: 0,
    expected_stock: await stock(p2),
  });
  assert.equal((await alice.call("/api/orders", "POST", body)).status, 409);
  assert.equal(await stock(p), 4);
  assert.equal(
    await db
      .prepare("SELECT id FROM orders WHERE idempotency_key=?")
      .bind(body.idempotency_key)
      .first(),
    null,
  );
});
test("valid transitions and concurrent pre-dispatch cancellation restore stock exactly once", async () => {
  const p = await product(4),
    o = (
      await alice.ok("/api/orders", "POST", confirm(await quote(alice, p, 2)))
    ).order;
  assert.equal(
    (
      await admin.call("/api/admin/orders/" + o.id, "PATCH", {
        status: "completed",
      })
    ).status,
    409,
  );
  await admin.ok("/api/admin/orders/" + o.id, "PATCH", { status: "preparing" });
  const r = await Promise.all([
    admin.call("/api/admin/orders/" + o.id, "PATCH", { status: "cancelled" }),
    admin.call("/api/admin/orders/" + o.id, "PATCH", { status: "cancelled" }),
  ]);
  assert.ok(r.some((x) => x.r.ok));
  await admin.ok("/api/admin/orders/" + o.id, "PATCH", { status: "cancelled" });
  assert.equal(await stock(p), 4);
  assert.equal(
    (
      await admin.call("/api/admin/orders/" + o.id, "PATCH", {
        status: "preparing",
      })
    ).status,
    409,
  );
  const p2 = await product(),
    o2 = (await bob.ok("/api/orders", "POST", confirm(await quote(bob, p2))))
      .order;
  await admin.ok("/api/admin/orders/" + o2.id, "PATCH", {
    status: "preparing",
  });
  await admin.ok("/api/admin/orders/" + o2.id, "PATCH", { status: "shipped" });
  assert.equal(
    (
      await admin.call("/api/admin/orders/" + o2.id, "PATCH", {
        status: "cancelled",
      })
    ).status,
    409,
  );
  assert.equal(await stock(p2), 9);
  await admin.ok("/api/admin/orders/" + o2.id, "PATCH", {
    status: "completed",
  });
});
test("factor bypass, cookie forgery, and reused backup code cannot grant internal access", async () => {
  const c = new Client();
  const r = await c.ok("/api/auth/sign-in/email", "POST", {
    email: admin.email,
    password,
  });
  assert.equal(r.twoFactorRedirect, true);
  assert.equal((await c.call("/api/admin/data")).status, 401);
  assert.equal(
    (
      await c.call("/api/auth/two-factor/verify-totp", "POST", {
        code: "000000",
        trustDevice: true,
      })
    ).r.ok,
    false,
  );
  assert.equal((await c.call("/api/admin/data")).status, 401);
  await c.ok("/api/auth/two-factor/verify-backup-code", "POST", {
    code: admin.backups[0],
    trustDevice: false,
  });
  await c.ok("/api/admin/data");
  assert.equal(
    (
      await c.call("/api/auth/two-factor/verify-backup-code", "POST", {
        code: admin.backups[0],
      })
    ).r.ok,
    false,
  );
  const forged = new Client();
  forged.cookies.set("better-auth.session_token", "forged");
  assert.equal((await forged.call("/api/admin/data")).status, 401);
});
test("CSRF, strict fields, persistent rate limits and audit records", async () => {
  const p = await product();
  assert.equal(
    (
      await admin.call(
        "/api/admin/products/" + p,
        "PATCH",
        { price: 1 },
        { Origin: "https://attacker.invalid" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await admin.call("/api/admin/products/" + p, "PATCH", {
        price: 1,
        role: "ADMIN",
      })
    ).status,
    400,
  );
  const c = new Client();
  let v;
  for (let i = 0; i < 6; i++)
    v = await c.call("/api/auth/request-password-reset", "POST", {
      email: "unknown@example.test",
      redirectTo: origin + "/account",
    });
  assert.equal(v.status, 429);
  const entries = (await admin.ok("/api/admin/audit")).entries;
  for (const action of [
    "permissions.updated",
    "product.updated",
    "order.status",
  ])
    assert.ok(
      entries.some((e) => e.action === action && e.actor_id && e.created_at),
    );
  await assert.rejects(() =>
    db.prepare("UPDATE audit_log SET action='erased'").run(),
  );
  const s = new Client();
  const r = await s.call("/api/auth/sign-in/email", "POST", {
    email: alice.email,
    password,
  });
  assert.match(r.r.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(r.r.headers.get("set-cookie"), /SameSite=Strict/i);
});
test("email verification and recovery work through Better Auth with local demo mail", async () => {
  const c = new Client(),
    email = "unverified-" + randomUUID() + "@example.test";
  await c.ok("/api/auth/sign-up/email", "POST", {
    name: "Unverified",
    email,
    password,
  });
  assert.equal(
    (await c.call("/api/auth/sign-in/email", "POST", { email, password })).r.ok,
    false,
  );
  const recovery = new Client();
  await recovery.ok("/api/auth/request-password-reset", "POST", {
    email: alice.email,
    redirectTo: origin + "/account?reset=1",
  });
  const mail = await db
    .prepare(
      "SELECT url FROM mail_outbox WHERE recipient=? AND subject='Reset your password' ORDER BY rowid DESC LIMIT 1",
    )
    .bind(alice.email)
    .first();
  assert.ok(mail);
  const reset = await recovery.call(
    new URL(mail.url).pathname + new URL(mail.url).search,
  );
  const redirect = reset.r.headers.get("location");
  assert.ok(redirect);
  const token = new URL(redirect).searchParams.get("token");
  assert.ok(token);
  await recovery.ok("/api/auth/reset-password", "POST", {
    token,
    newPassword: "Changed-fictional-password-948!",
  });
  assert.equal((await alice.call("/api/orders")).status, 401);
  await recovery.ok("/api/auth/sign-in/email", "POST", {
    email: alice.email,
    password: "Changed-fictional-password-948!",
  });
});

test("each staff grant is independent, disablement is immediate, and enrollment flags alone fail", async () => {
  const p = await product(),
    id = staff.user.id;
  await admin.ok("/api/admin/users/" + id, "PATCH", {
    role: "STAFF",
    disabled: false,
    permissions: [
      "products.describe",
      "stock.adjust",
      "categories.manage",
      "orders.update",
    ],
  });
  await staff.ok("/api/admin/products/" + p, "PATCH", {
    description_en: "Fictional revised description",
  });
  await staff.ok("/api/admin/products/" + p, "PATCH", {
    stock: 5,
    expected_stock: await stock(p),
  });
  await staff.ok("/api/admin/categories", "POST", {
    name_ar: "قسم موظف خيالي",
    name_en: "Fictional staff category",
  });
  assert.equal(
    (await staff.call("/api/admin/products/" + p, "PATCH", { price: 1 }))
      .status,
    403,
  );
  const o = (await bob.ok("/api/orders", "POST", confirm(await quote(bob, p))))
    .order;
  assert.equal((await staff.call("/api/admin/orders/" + o.id)).status, 403);
  await staff.ok("/api/admin/orders/" + o.id, "PATCH", { status: "preparing" });
  await admin.ok("/api/admin/users/" + id, "PATCH", {
    role: "STAFF",
    disabled: false,
    permissions: ["orders.read"],
  });
  await staff.ok("/api/admin/orders/" + o.id);
  assert.equal(
    (
      await staff.call("/api/admin/orders/" + o.id, "PATCH", {
        status: "shipped",
      })
    ).status,
    403,
  );
  const oldSession = new Client();
  oldSession.cookies = new Map(staff.cookies);
  await admin.ok("/api/admin/users/" + id, "PATCH", {
    role: "STAFF",
    disabled: true,
    permissions: ["orders.read"],
  });
  assert.equal((await staff.call("/api/admin/data")).status, 401);
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM session WHERE userId=?")
        .bind(id)
        .first()
    ).n,
    0,
  );
  assert.equal(
    (
      await staff.call("/api/auth/sign-in/email", "POST", {
        email: staff.email,
        password,
      })
    ).status,
    401,
  );
  await admin.ok("/api/admin/users/" + id, "PATCH", {
    role: "STAFF",
    disabled: false,
    permissions: ["orders.read"],
  });
  assert.equal((await staff.call("/api/admin/data")).status, 401);
  assert.equal((await oldSession.call("/api/admin/data")).status, 401);
  assert.equal(
    (
      await staff.call("/api/auth/sign-in/email", "POST", {
        email: staff.email,
        password,
      })
    ).data.twoFactorRedirect,
    true,
  );
  await staff.ok("/api/auth/two-factor/verify-totp", "POST", {
    code: totp(staff.uri),
    trustDevice: false,
  });
  await db
    .prepare(
      "DELETE FROM mfa_sessions WHERE session_id IN (SELECT id FROM session WHERE userId=?)",
    )
    .bind(id)
    .run();
  assert.equal(
    (await staff.call("/api/admin/data")).data.error,
    "TWO_FACTOR_REQUIRED",
  );
  await staff.ok("/api/auth/two-factor/verify-totp", "POST", {
    code: totp(staff.uri),
    trustDevice: false,
  });
  await staff.ok("/api/admin/data");
});

test("one quote with different concurrent keys yields one order and one inventory deduction", async () => {
  const p = await product(6),
    q = await quote(bob, p, 2),
    body = confirm(q);
  const results = await Promise.all([
    bob.call("/api/orders", "POST", body),
    bob.call("/api/orders", "POST", { ...body, idempotency_key: randomUUID() }),
  ]);
  assert.ok(results.every((r) => r.status === 200 || r.status === 201));
  assert.equal(results[0].data.order.id, results[1].data.order.id);
  assert.equal(await stock(p), 4);
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM orders WHERE quote_id=?")
        .bind(q.id)
        .first()
    ).n,
    1,
  );
  await db
    .prepare("UPDATE checkout_quotes SET expires_at=0 WHERE id=?")
    .bind(q.id)
    .run();
  assert.equal(
    (
      await bob.ok("/api/orders", "POST", {
        ...body,
        idempotency_key: randomUUID(),
      })
    ).order.id,
    results[0].data.order.id,
  );
  assert.equal(
    (
      await bob.call("/api/orders", "POST", {
        ...body,
        idempotency_key: randomUUID(),
        shipping: { ...shipping, address: "Different address" },
      })
    ).status,
    409,
  );
  const other = await register("other-buyer");
  assert.equal(
    (
      await other.call("/api/orders", "POST", {
        ...body,
        idempotency_key: randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal(await stock(p), 4);
});

test("a stale description preserves current stock and stale stock edits conflict", async () => {
  const p = await product(10);
  await admin.ok("/api/admin/products/" + p, "PATCH", {
    stock: 8,
    expected_stock: 10,
  });
  await admin.ok("/api/admin/products/" + p, "PATCH", {
    description_en: "Description from stale form",
  });
  assert.equal(await stock(p), 8);
  assert.equal(
    (
      await admin.call("/api/admin/products/" + p, "PATCH", {
        stock: 12,
        expected_stock: 10,
      })
    ).status,
    409,
  );
  assert.equal(
    (await admin.call("/api/admin/products/" + p, "PATCH", { stock: 12 }))
      .status,
    400,
  );
  assert.equal(await stock(p), 8);
});

test("admin order summaries omit contact data and secrets; details retain the permission check", async () => {
  const { orders } = await admin.ok("/api/admin/data");
  assert.ok(orders.length);
  assert.deepEqual(
    Object.keys(orders[0]).sort(),
    ["id", "order_number", "customer_name", "status", "total"].sort(),
  );
  const detail = await admin.ok("/api/admin/orders/" + orders[0].id);
  assert.ok(detail.order.phone);
  assert.ok(detail.order.address);
  for (const k of ["request_hash", "access_token_hash", "idempotency_key"])
    assert.ok(!(k in detail.order));
});

test("migration preserves duplicate historical orders and blocks their consumed quotes; bootstrap is one-time", async () => {
  const upgrade = await mf.getD1Database("UPGRADE");
  for (const name of ["0001_store.sql", "0002_identity_and_checkout.sql"])
    await upgrade.exec(
      readFileSync("migrations/" + name, "utf8")
        .replace(/--[^\n]*/g, "")
        .replace(/\r?\n/g, " "),
    );
  await upgrade
    .prepare(
      "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('old-customer','Old customer','old@example.test',1,0,0)",
    )
    .run();
  const q = randomUUID();
  await upgrade
    .prepare("INSERT INTO checkout_quotes VALUES(?,'old-customer','{}',?)")
    .bind(q, Date.now() + 600_000)
    .run();
  const historical = (key) =>
    upgrade
      .prepare(
        "INSERT INTO orders(order_number,idempotency_key,request_hash,access_token_hash,customer_name,phone,governorate,area,address,subtotal,delivery_fee,total,currency,customer_id,quote_id) VALUES(?,?,?,'','Old customer','07000000000','Baghdad','Test','Test',0,5000,5000,'IQD','old-customer',?)",
      )
      .bind(key, key, "old-payload", q);
  await historical("historical-1").run();
  await historical("historical-2").run();
  await upgrade.exec(
    readFileSync("migrations/0003_release_integrity.sql", "utf8")
      .replace(/--[^\n]*/g, "")
      .replace(/\r?\n/g, " "),
  );
  assert.equal(
    (await upgrade.prepare("SELECT COUNT(*) AS n FROM orders").first()).n,
    2,
  );
  assert.equal(
    (
      await upgrade
        .prepare("SELECT * FROM checkout_claims WHERE quote_id=?")
        .bind(q)
        .first()
    ).order_id,
    1,
  );
  await assert.rejects(() => historical("historical-3").run(), /UNIQUE/);
  const { testAdminSql } = await import("../scripts/test-admin.mjs");
  const { hashPassword, verifyPassword } = await import("better-auth/crypto");
  const initial = randomUUID().slice(0, 11);
  await upgrade.exec(
    testAdminSql("bootstrap@example.test", await hashPassword(initial)).replace(
      /\n/g,
      " ",
    ),
  );
  await upgrade.exec(
    testAdminSql(
      "bootstrap@example.test",
      await hashPassword(randomUUID()),
    ).replace(/\n/g, " "),
  );
  const row = await upgrade
    .prepare(
      "SELECT u.*,a.password FROM user u JOIN account a ON a.userId=u.id WHERE u.loginName='ADMIN'",
    )
    .first();
  assert.equal(row.role, "ADMIN");
  assert.equal(row.emailVerified, 1);
  assert.equal(row.passwordChangeRequired, 1);
  assert.equal(
    await verifyPassword({ hash: row.password, password: initial }),
    true,
  );
  assert.equal(
    (
      await upgrade
        .prepare("SELECT COUNT(*) AS n FROM user WHERE role='ADMIN'")
        .first()
    ).n,
    1,
  );
});

test("ADMIN alias uses Better Auth and requires a normal password change and verified factor", async () => {
  const { hashPassword } = await import("better-auth/crypto");
  const initial = randomUUID().replaceAll("-", "").slice(0, 11),
    replacement = randomUUID() + "!";
  await db
    .prepare(
      "UPDATE user SET loginName='ADMIN',passwordChangeRequired=1 WHERE id=?",
    )
    .bind(admin.user.id)
    .run();
  await db
    .prepare(
      "UPDATE account SET password=? WHERE userId=? AND providerId='credential'",
    )
    .bind(await hashPassword(initial), admin.user.id)
    .run();
  const c = new Client();
  assert.equal(
    (
      await c.ok("/api/auth/sign-in/email", "POST", {
        email: "ADMIN",
        password: initial,
      })
    ).twoFactorRedirect,
    true,
  );
  await c.ok("/api/auth/two-factor/verify-totp", "POST", {
    code: totp(admin.uri),
    trustDevice: false,
  });
  assert.equal(
    (await c.call("/api/admin/data")).data.error,
    "PASSWORD_CHANGE_REQUIRED",
  );
  assert.equal(
    (
      await c.call("/api/auth/change-password", "POST", {
        currentPassword: initial,
        newPassword: initial,
      })
    ).status,
    400,
  );
  await c.ok("/api/auth/change-password", "POST", {
    currentPassword: initial,
    newPassword: replacement,
    revokeOtherSessions: true,
  });
  assert.equal((await c.ok("/api/me/session")).user.passwordChangeRequired, 0);
  await db
    .prepare(
      "DELETE FROM mfa_sessions WHERE session_id IN (SELECT id FROM session WHERE userId=?)",
    )
    .bind(admin.user.id)
    .run();
  assert.equal(
    (await c.call("/api/admin/data")).data.error,
    "TWO_FACTOR_REQUIRED",
  );
  await c.ok("/api/auth/two-factor/verify-totp", "POST", {
    code: totp(admin.uri),
    trustDevice: false,
  });
  await c.ok("/api/admin/data");
  const { testAdminSql } = await import("../scripts/test-admin.mjs");
  await db.exec(
    testAdminSql(
      "another-admin@example.test",
      await hashPassword(replacement),
    ).replace(/\n/g, " "),
  );
  const credential = await db
    .prepare(
      "SELECT password FROM account WHERE userId=? AND providerId='credential'",
    )
    .bind(admin.user.id)
    .first();
  const { verifyPassword } = await import("better-auth/crypto");
  assert.equal(
    await verifyPassword({ hash: credential.password, password: replacement }),
    true,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM user WHERE role='ADMIN'")
        .first()
    ).n,
    1,
  );
});

test("hosted Access gate protects frontend and API, validates signatures, and sets Secure session cookies", async () => {
  const { generateKeyPair, exportJWK, SignJWT } = await import("jose");
  const { hashPassword } = await import("better-auth/crypto");
  const { publicKey, privateKey } = await generateKeyPair("RS256"),
    key = {
      ...(await exportJWK(publicKey)),
      kid: "fictional-access-key",
      alg: "RS256",
      use: "sig",
    };
  const host = "https://private-demo.example.test",
    team = "https://fictional-maktabati.cloudflareaccess.com",
    aud = "fictional-audience";
  const token = async (a = aud) =>
    new SignJWT({ email: "approved@example.test" })
      .setProtectedHeader({ alg: "RS256", kid: key.kid })
      .setIssuer(team)
      .setAudience(a)
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(privateKey);
  const hosted = new Miniflare(
    convertV4MiniflareOptions({
      modulesRoot: resolve("dist/school_supplies_store"),
      modules: [
        "index.js",
        ...readdirSync("dist/school_supplies_store/assets")
          .filter((f) => f.endsWith(".js"))
          .map((f) => "assets/" + f),
      ].map((f) => ({
        type: "ESModule",
        path: resolve("dist/school_supplies_store", f),
      })),
      compatibilityDate: "2026-10-24",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "isolated-hosted-tests" },
      bindings: {
        APP_ENV: "demo",
        APP_ORIGIN: host,
        BETTER_AUTH_SECRET: "isolated-hosted-secret-over-32-characters-123",
        ACCESS_TEAM_DOMAIN: team,
        ACCESS_AUD: aud,
      },
      serviceBindings: {
        ASSETS: () =>
          new Response("<html>private asset</html>", {
            headers: { "Content-Type": "text/html" },
          }),
      },
      outboundService: (request) =>
        request.url === team + "/cdn-cgi/access/certs"
          ? Response.json({ keys: [key] })
          : new Response("No external service in tests", { status: 404 }),
    }),
  );
  try {
    for (const path of [
      "/",
      "/account",
      "/assets/app.js",
      "/api/store",
      "/api/orders",
    ]) {
      assert.equal((await hosted.dispatchFetch(host + path)).status, 403);
      assert.equal(
        (
          await hosted.dispatchFetch(host + path, {
            headers: { "Cf-Access-Jwt-Assertion": "forged-token" },
          })
        ).status,
        403,
      );
    }
    const wrong = await token("wrong-audience");
    assert.equal(
      (
        await hosted.dispatchFetch(host + "/", {
          headers: { "Cf-Access-Jwt-Assertion": wrong },
        })
      ).status,
      403,
    );
    const assertion = await token(),
      headers = { "Cf-Access-Jwt-Assertion": assertion };
    assert.equal(
      (await hosted.dispatchFetch(host + "/", { headers })).status,
      200,
    );
    assert.equal(
      (await hosted.dispatchFetch(host + "/api/health", { headers })).status,
      200,
    );
    assert.equal(
      (
        await hosted.dispatchFetch(
          host + "/api/local/mail?email=x@example.test",
          { headers },
        )
      ).status,
      404,
    );
    const hdb = await hosted.getD1Database("DB");
    for (const path of [
      "migrations/0001_store.sql",
      "migrations/0002_identity_and_checkout.sql",
      "migrations/0003_release_integrity.sql",
    ])
      await hdb.exec(
        readFileSync(path, "utf8")
          .replace(/--[^\n]*/g, "")
          .replace(/\r?\n/g, " "),
      );
    const now = Date.now(),
      id = randomUUID(),
      email = "hosted@example.test";
    await hdb
      .prepare(
        "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)",
      )
      .bind(id, "Fictional Hosted Customer", email, now, now)
      .run();
    await hdb
      .prepare(
        "INSERT INTO account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)",
      )
      .bind(
        randomUUID(),
        id,
        "credential",
        id,
        await hashPassword(password),
        now,
        now,
      )
      .run();
    const r = await hosted.dispatchFetch(host + "/api/auth/sign-in/email", {
      method: "POST",
      headers: { ...headers, Origin: host, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(r.status, 200, await r.clone().text());
    const cookie = r.headers.get("set-cookie");
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    const csp = r.headers.get("content-security-policy");
    assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"));
    assert.ok(r.headers.get("strict-transport-security"));
  } finally {
    await hosted.dispose();
  }
});
