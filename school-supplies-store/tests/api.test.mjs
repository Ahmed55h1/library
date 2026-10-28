import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = (process.env.BASE_URL || "http://localhost:5173").replace(
  /\/$/,
  "",
);
const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;
let cookie = "";

async function request(
  path,
  { method = "GET", data, auth = false, headers = {}, form } = {},
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(method !== "GET" ? { Origin: base } : {}),
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(auth && cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: form || (data !== undefined ? JSON.stringify(data) : undefined),
  });
  const cookies = response.headers.getSetCookie?.() || [];
  if (cookies.length)
    cookie = cookies.map((entry) => entry.split(";")[0]).join("; ");
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body, headers: response.headers };
}

function success(response) {
  assert.ok(
    response.status >= 200 && response.status < 300,
    `Expected success, got ${response.status}: ${JSON.stringify(response.body)}`,
  );
  return response.body;
}

function rejected(response) {
  assert.ok(
    response.status >= 400 && response.status < 500,
    `Expected client rejection, got ${response.status}: ${JSON.stringify(response.body)}`,
  );
}

function entity(body, key) {
  return body[key] || body;
}

test("Local D1 / R2 store integration", { timeout: 120_000 }, async (t) => {
  assert.ok(
    email && password,
    "Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD for a temporary local administrator before running test:api.",
  );
  const tag = `QA ${Date.now()}`;
  const cleanup = { categories: [], products: [], orders: [] };
  let originalOrder = [];
  let category;
  let destination;
  let product;
  let store;
  let orderResult;
  let payload;
  const adminData = async () =>
    success(await request("/api/admin/data", { auth: true }));
  const currentStock = async (id) =>
    (await adminData()).products.find((p) => p.id === id)?.stock;
  const productBody = (categoryId, name, stock = 10) => ({
    category_id: categoryId,
    name_ar: `${name} منتج اختبار`,
    name_en: name,
    description_ar: "منتج مؤقت لفحص تكامل قاعدة البيانات.",
    description_en: "Temporary database integration test product.",
    price: 1250,
    stock,
    image_url: "",
    visible: 1,
    sort_order: 0,
    subject: "",
    academic_level: "",
    teacher_name: "",
  });
  const checkout = (id, quantity, key = randomUUID()) => ({
    idempotency_key: key,
    customer_name: `${tag} Customer`,
    phone: "07701234567",
    governorate: "Baghdad",
    area: "Test district",
    address: "QA test address, building 10",
    notes: "Automated local integration test. Do not fulfil.",
    payment_method: "cod",
    items: [{ product_id: id, quantity, price: 1 }],
    subtotal: 1,
    delivery_fee: 0,
    total: 1,
  });

  try {
    await t.test(
      "public catalog contains bilingual database content",
      async () => {
        store = success(await request("/api/store"));
        assert.ok(Array.isArray(store.categories));
        assert.ok(Array.isArray(store.products));
        for (const row of [...store.categories, ...store.products]) {
          assert.ok(row.name_ar?.trim());
          assert.ok(row.name_en?.trim());
        }
        assert.equal(typeof store.settings.currency, "string");
        originalOrder = store.categories.map((c) => c.id);
      },
    );

    await t.test(
      "administrative APIs reject unauthenticated access",
      async () => {
        assert.equal((await request("/api/admin/data")).status, 401);
        assert.equal(
          (
            await request("/api/admin/categories", {
              method: "POST",
              data: { name_ar: "غير مصرح", name_en: "Unauthorized" },
            })
          ).status,
          401,
        );
        const me = success(await request("/api/auth/me"));
        assert.equal(me.admin, null);
      },
    );

    await t.test(
      "login rejects a wrong password and accepts the supplied administrator",
      async () => {
        rejected(
          await request("/api/auth/login", {
            method: "POST",
            data: { email, password: `${password}-wrong` },
          }),
        );
        const loggedIn = await request("/api/auth/login", {
          method: "POST",
          data: { email, password },
        });
        success(loggedIn);
        assert.match(loggedIn.headers.get("Set-Cookie") || "", /HttpOnly/i);
        assert.match(
          loggedIn.headers.get("Set-Cookie") || "",
          /SameSite=Strict/i,
        );
        assert.ok(cookie.includes("="));
        assert.ok(success(await request("/api/auth/me", { auth: true })).admin);
      },
    );

    await t.test(
      "published categories require both languages and persist their ordering",
      async () => {
        rejected(
          await request("/api/admin/categories", {
            method: "POST",
            auth: true,
            data: { name_ar: "اختبار", name_en: "", visible: 1 },
          }),
        );
        category = entity(
          success(
            await request("/api/admin/categories", {
              method: "POST",
              auth: true,
              data: {
                name_ar: `${tag} اختبار`,
                name_en: `${tag} Category`,
                image_url: "",
                visible: 1,
              },
            }),
          ),
          "category",
        );
        assert.ok(category.id);
        cleanup.categories.push(category.id);
        destination = entity(
          success(
            await request("/api/admin/categories", {
              method: "POST",
              auth: true,
              data: {
                name_ar: `${tag} بديل`,
                name_en: `${tag} Destination`,
                image_url: "",
                visible: 1,
              },
            }),
          ),
          "category",
        );
        cleanup.categories.push(destination.id);
        const ids = (await adminData()).categories.map((c) => c.id);
        const reordered = [
          category.id,
          ...ids.filter((id) => id !== category.id),
        ];
        success(
          await request("/api/admin/categories/reorder", {
            method: "POST",
            auth: true,
            data: { ids: reordered },
          }),
        );
        assert.deepEqual(
          (await adminData()).categories.map((c) => c.id),
          reordered,
        );
        assert.deepEqual(
          success(await request("/api/store")).categories.map((c) => c.id),
          reordered,
        );
      },
    );

    await t.test(
      "image upload validates content and stores an image in local R2",
      async () => {
        const bad = new FormData();
        bad.append(
          "file",
          new Blob(["<script>alert(1)</script>"], { type: "image/png" }),
          "fake.png",
        );
        rejected(
          await request("/api/admin/images", {
            method: "POST",
            auth: true,
            form: bad,
          }),
        );
        const bytes = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=",
          "base64",
        );
        const form = new FormData();
        form.append(
          "file",
          new Blob([bytes], { type: "image/png" }),
          "qa-pixel.png",
        );
        const uploaded = success(
          await request("/api/admin/images", {
            method: "POST",
            auth: true,
            form,
          }),
        );
        assert.ok(uploaded.url);
        const response = await fetch(new URL(uploaded.url, base));
        assert.equal(response.status, 200);
        assert.match(response.headers.get("Content-Type") || "", /^image\/png/);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
        const oversized = new FormData();
        const largeBytes = new Uint8Array(5 * 1024 * 1024 + 1);
        largeBytes.set(bytes);
        oversized.append(
          "file",
          new Blob([largeBytes], { type: "image/png" }),
          "too-large.png",
        );
        assert.equal(
          (
            await request("/api/admin/images", {
              method: "POST",
              auth: true,
              form: oversized,
            })
          ).status,
          413,
        );
      },
    );

    await t.test(
      "product creation, bilingual validation, inventory editing, and recategorization work",
      async () => {
        rejected(
          await request("/api/admin/products", {
            method: "POST",
            auth: true,
            data: {
              ...productBody(category.id, `${tag} Invalid`),
              name_en: "",
            },
          }),
        );
        product = entity(
          success(
            await request("/api/admin/products", {
              method: "POST",
              auth: true,
              data: productBody(category.id, `${tag} Product`),
            }),
          ),
          "product",
        );
        assert.ok(product.id);
        cleanup.products.push(product.id);
        success(
          await request(`/api/admin/products/${product.id}`, {
            method: "PATCH",
            auth: true,
            data: {
              ...productBody(category.id, `${tag} Product`, 12),
              expected_stock: 10,
              subject: "Math",
              academic_level: "Grade 6",
              teacher_name: "QA",
            },
          }),
        );
        assert.equal(await currentStock(product.id), 12);
        const staleUpdate = await request(`/api/admin/products/${product.id}`, {
          method: "PATCH",
          auth: true,
          data: { stock: 99, expected_stock: 10 },
        });
        assert.equal(staleUpdate.status, 409);
        assert.equal(staleUpdate.body.error, "STOCK_CHANGED");
        assert.equal(await currentStock(product.id), 12);
        rejected(
          await request(`/api/admin/categories/${category.id}`, {
            method: "DELETE",
            auth: true,
          }),
        );
        success(
          await request(`/api/admin/categories/${category.id}`, {
            method: "DELETE",
            auth: true,
            data: { move_to_id: destination.id },
          }),
        );
        assert.equal(
          (await adminData()).products.find((p) => p.id === product.id)
            .category_id,
          destination.id,
        );
        success(
          await request(`/api/admin/products/${product.id}`, {
            method: "PATCH",
            auth: true,
            data: { visible: 0 },
          }),
        );
        assert.ok(
          !success(await request("/api/store")).products.some(
            (p) => p.id === product.id,
          ),
        );
        success(
          await request(`/api/admin/products/${product.id}`, {
            method: "PATCH",
            auth: true,
            data: { visible: 1 },
          }),
        );
        assert.ok(
          success(await request("/api/store")).products.some(
            (p) => p.id === product.id,
          ),
        );
      },
    );

    await t.test(
      "server pricing, order snapshots, stock decrement, and idempotency are correct",
      async () => {
        payload = checkout(product.id, 2);
        orderResult = success(
          await request("/api/orders", { method: "POST", data: payload }),
        );
        cleanup.orders.push(orderResult.order.id);
        const rate = store.deliveryRates.find(
          (r) => r.governorate === "Baghdad",
        );
        assert.ok(
          rate,
          "Baghdad delivery rate must be configured for the test",
        );
        assert.equal(orderResult.order.subtotal, 2500);
        assert.equal(orderResult.order.delivery_fee, rate.fee);
        assert.equal(orderResult.order.total, 2500 + rate.fee);
        assert.equal(orderResult.order.payment_method, "cod");
        assert.equal(orderResult.order.payment_status, "unpaid");
        assert.equal(orderResult.items[0].price, 1250);
        assert.equal(orderResult.items[0].quantity, 2);
        assert.equal(await currentStock(product.id), 10);
        const duplicate = success(
          await request("/api/orders", { method: "POST", data: payload }),
        );
        assert.equal(duplicate.order.id, orderResult.order.id);
        assert.equal(await currentStock(product.id), 10);
        rejected(
          await request("/api/orders", {
            method: "POST",
            data: {
              ...payload,
              items: [{ product_id: product.id, quantity: 3 }],
            },
          }),
        );
        assert.equal(await currentStock(product.id), 10);
      },
    );

    await t.test(
      "customer order details require the private access token; admin can find the order",
      async () => {
        rejected(await request(`/api/orders/${orderResult.order.id}`));
        rejected(
          await request(`/api/orders/${orderResult.order.id}?token=incorrect`),
        );
        assert.ok(orderResult.access_token);
        const detail = success(
          await request(
            `/api/orders/${orderResult.order.id}?token=${encodeURIComponent(orderResult.access_token)}`,
          ),
        );
        assert.equal(detail.order.id, orderResult.order.id);
        const admin = await adminData();
        assert.ok(
          admin.orders.some((order) => order.id === orderResult.order.id),
        );
        const adminDetail = success(
          await request(`/api/admin/orders/${orderResult.order.id}`, {
            auth: true,
          }),
        );
        assert.equal(adminDetail.order.total, orderResult.order.total);
        success(
          await request(`/api/admin/products/${product.id}`, {
            method: "PATCH",
            auth: true,
            data: { price: 1500 },
          }),
        );
        const snapshot = success(
          await request(`/api/admin/orders/${orderResult.order.id}`, {
            auth: true,
          }),
        );
        assert.equal(snapshot.items[0].price, 1250);
        assert.equal(snapshot.order.total, orderResult.order.total);
        success(
          await request(`/api/admin/products/${product.id}`, {
            method: "PATCH",
            auth: true,
            data: { price: 1250 },
          }),
        );
        success(
          await request(`/api/admin/orders/${orderResult.order.id}`, {
            method: "PATCH",
            auth: true,
            data: { status: "preparing", payment_status: "unpaid" },
          }),
        );
        assert.equal(
          success(
            await request(`/api/admin/orders/${orderResult.order.id}`, {
              auth: true,
            }),
          ).order.status,
          "preparing",
        );
      },
    );

    await t.test(
      "invalid quantities and unsupported online payments are rejected",
      async () => {
        for (const quantity of [0, -1, 1.5, 999999]) {
          rejected(
            await request("/api/orders", {
              method: "POST",
              data: checkout(product.id, quantity),
            }),
          );
        }
        rejected(
          await request("/api/orders", {
            method: "POST",
            data: { ...checkout(product.id, 1), payment_method: "card" },
          }),
        );
        rejected(
          await request("/api/orders", {
            method: "POST",
            data: { ...checkout(product.id, 1), items: [null] },
          }),
        );
        assert.equal(await currentStock(product.id), 10);
      },
    );

    await t.test(
      "simultaneous retries of the same checkout reserve inventory once",
      async () => {
        const repeated = checkout(product.id, 1);
        const results = await Promise.all([
          request("/api/orders", { method: "POST", data: repeated }),
          request("/api/orders", { method: "POST", data: repeated }),
        ]);
        const responses = results.map(success);
        assert.equal(responses[0].order.id, responses[1].order.id);
        cleanup.orders.push(responses[0].order.id);
        assert.equal(await currentStock(product.id), 9);
        success(
          await request(`/api/admin/orders/${responses[0].order.id}`, {
            method: "PATCH",
            auth: true,
            data: { status: "cancelled", payment_status: "unpaid" },
          }),
        );
        assert.equal(await currentStock(product.id), 10);
      },
    );

    await t.test(
      "concurrent checkouts cannot oversell the final unit",
      async () => {
        const limited = entity(
          success(
            await request("/api/admin/products", {
              method: "POST",
              auth: true,
              data: productBody(destination.id, `${tag} Last unit`, 1),
            }),
          ),
          "product",
        );
        cleanup.products.push(limited.id);
        success(
          await request("/api/admin/products/reorder", {
            method: "POST",
            auth: true,
            data: {
              category_id: destination.id,
              ids: [limited.id, product.id],
            },
          }),
        );
        assert.deepEqual(
          (await adminData()).products
            .filter((p) => p.category_id === destination.id)
            .map((p) => p.id),
          [limited.id, product.id],
        );
        const results = await Promise.all([
          request("/api/orders", {
            method: "POST",
            data: checkout(limited.id, 1),
          }),
          request("/api/orders", {
            method: "POST",
            data: checkout(limited.id, 1),
          }),
        ]);
        const passed = results.filter((r) => r.status >= 200 && r.status < 300);
        const failed = results.filter((r) => r.status >= 400 && r.status < 500);
        assert.equal(passed.length, 1, JSON.stringify(results));
        assert.equal(failed.length, 1, JSON.stringify(results));
        cleanup.orders.push(passed[0].body.order.id);
        assert.equal(await currentStock(limited.id), 0);
      },
    );

    await t.test(
      "cancelling an order restores stock exactly once",
      async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          success(
            await request(`/api/admin/orders/${orderResult.order.id}`, {
              method: "PATCH",
              auth: true,
              data: { status: "cancelled", payment_status: "unpaid" },
            }),
          );
          assert.equal(await currentStock(product.id), 12);
        }
      },
    );

    await t.test("cross-site administrative writes are rejected", async () => {
      assert.equal(
        (
          await request("/api/admin/categories", {
            method: "POST",
            auth: true,
            headers: { Origin: "https://untrusted.example" },
            data: { name_ar: "اختبار", name_en: "Cross site", visible: 1 },
          })
        ).status,
        403,
      );
    });
  } finally {
    // Keep order history as an audit trail, marked QA and cancelled. Remove only records created here.
    if (cookie) {
      for (const id of cleanup.orders) {
        await request(`/api/admin/orders/${id}`, {
          method: "PATCH",
          auth: true,
          data: { status: "cancelled", payment_status: "unpaid" },
        });
      }
      for (const id of cleanup.products) {
        await request(`/api/admin/products/${id}`, {
          method: "DELETE",
          auth: true,
        });
      }
      for (const id of cleanup.categories) {
        await request(`/api/admin/categories/${id}`, {
          method: "DELETE",
          auth: true,
        });
      }
      if (originalOrder.length) {
        const remaining = (await adminData()).categories.map((c) => c.id);
        const restored = [
          ...originalOrder.filter((id) => remaining.includes(id)),
          ...remaining.filter((id) => !originalOrder.includes(id)),
        ];
        await request("/api/admin/categories/reorder", {
          method: "POST",
          auth: true,
          data: { ids: restored },
        });
      }
      success(
        await request("/api/auth/logout", { method: "POST", auth: true }),
      );
      assert.equal(
        (await request("/api/admin/data", { auth: true })).status,
        401,
      );
    }
  }
});
