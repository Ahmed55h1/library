import { test, expect } from "@playwright/test";
import { randomUUID, createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { hashPassword } from "better-auth/crypto";
const origin = process.env.BASE_URL || "http://127.0.0.1:5173",
  password = "Fictional-demo-password-768!";
let adminId;
function sql(command) {
  if (!process.env.MAKTABATI_TEST_DB_DIR || !process.env.MAKTABATI_TEST_CONFIG)
    throw new Error("Run npm run test:ui to use the isolated test database.");
  const r = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "school-supplies-store",
      "--local",
      "--config",
      process.env.MAKTABATI_TEST_CONFIG,
      "--persist-to",
      process.env.MAKTABATI_TEST_DB_DIR,
      "--command",
      command,
    ],
    { encoding: "utf8" },
  );
  if (r.status) throw new Error(r.stderr || r.stdout);
}
async function mutate(request, path, body) {
  const r = await request.post(path, {
    headers: { Origin: origin },
    data: body,
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
async function locale(page, lang) {
  if ((await page.locator("html").getAttribute("lang")) !== lang)
    await page
      .getByRole("button", {
        name: lang === "en" ? "English" : "العربية",
        exact: true,
      })
      .click();
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    lang === "ar" ? "rtl" : "ltr",
  );
}
async function fits(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
}
async function account(request, tag) {
  const email = `ui-${tag}-${randomUUID()}@example.test`;
  await mutate(request, "/api/auth/sign-up/email", {
    name: "Fictional UI Student",
    email,
    password,
    callbackURL: origin + "/account",
  });
  const messages = await (
    await request.get("/api/local/mail?email=" + encodeURIComponent(email))
  ).json();
  const v = await request.get(messages.messages[0].url);
  expect(v.ok()).toBeTruthy();
  return email;
}
function totp(secret) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase().replace(/=/g, ""))
    bits += a.indexOf(c).toString(2).padStart(5, "0");
  const b = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    b.push(parseInt(bits.slice(i, i + 8), 2));
  const count = Buffer.alloc(8);
  count.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", Buffer.from(b)).update(count).digest(),
    o = h.at(-1) & 15;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
const cleanCategories =
  "DELETE FROM categories WHERE name_en LIKE 'Fictional UI Category %' AND NOT EXISTS(SELECT 1 FROM products WHERE category_id=categories.id);";
const staffFixtures =
  "SELECT id FROM user WHERE name='Fictional UI Student' AND email LIKE 'ui-staff-%@example.test'";
const cleanStaff = `DELETE FROM staff_permissions WHERE user_id IN (${staffFixtures}); DELETE FROM session WHERE userId IN (${staffFixtures}); UPDATE user SET role='CUSTOMER',disabled=1 WHERE id IN (${staffFixtures});`;
test.beforeAll(() =>
  sql("DELETE FROM auth_attempts;" + cleanCategories + cleanStaff),
);
// Each browser scenario starts with its own throttle window in this disposable DB.
test.beforeEach(() => sql("DELETE FROM auth_attempts;"));
test.afterAll(() => {
  sql(cleanCategories + cleanStaff);
  if (adminId)
    sql(
      `DELETE FROM session WHERE userId='${adminId}'; UPDATE user SET role='CUSTOMER',disabled=1 WHERE id='${adminId}';`,
    );
});
test("Arabic and English catalog, bilingual search, cart quantities, desktop and phone", async ({
  page,
  request,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const store = await (await request.get("/api/store")).json(),
    p = store.products.find((p) => p.stock > 3);
  expect(p).toBeTruthy();
  await page.goto("/");
  await expect(page.locator(".hero")).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const lang of ["ar", "en"]) {
      await locale(page, lang);
      await fits(page);
      await page.screenshot({
        path: info.outputPath(`store-${lang}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.goto("/shop");
  await locale(page, "en");
  for (const term of [p.name_ar, p.name_en]) {
    await page.getByRole("searchbox", { name: "Search products" }).fill(term);
    await expect(
      page.locator(".product-card").filter({ hasText: p.name_en }),
    ).toHaveCount(1);
  }
  await page.goto("/product/" + p.id);
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.goto("/cart");
  await page
    .getByRole("button", { name: "Increase quantity", exact: true })
    .click();
  await page.reload();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("maktabati-cart"))[0].quantity,
    ),
  ).toBe(2);
  await locale(page, "ar");
  await fits(page);
  await expect(page.locator(".cart-row")).toContainText(p.name_ar);
  expect(errors).toEqual([]);
});
test("customer signs in, reviews server totals, confirms a demo order, tracks it in both languages", async ({
  page,
  request,
}, info) => {
  const email = await account(request, "customer"),
    store = await (await request.get("/api/store")).json(),
    p = store.products.find((p) => p.stock > 2);
  await page.goto("/account");
  await locale(page, "en");
  await page.getByLabel("Email or admin login").fill(email);
  await page.locator(".account-form input[type=password]").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My account & orders" }),
  ).toBeVisible();
  await page.evaluate(
    (id) =>
      localStorage.setItem(
        "maktabati-cart",
        JSON.stringify([{ product_id: id, quantity: 1 }]),
      ),
    p.id,
  );
  await page.goto("/checkout");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, value] of Object.entries({
    customer_name: "Fictional UI Student",
    phone: "07000000000",
    area: "Demo district",
    address: "Imaginary road 12",
  }))
    await page.locator(`[name=${name}]`).fill(value);
  await page.locator("[name=governorate]").selectOption("Baghdad");
  await fits(page);
  await page.getByRole("button", { name: "Review price & delivery" }).click();
  await expect(
    page.getByRole("heading", { name: "Review before confirming" }),
  ).toBeVisible();
  await expect(page.locator(".review-quote")).toContainText(
    "calculated by the server",
  );
  await page.screenshot({
    path: info.outputPath("demo-review-en-phone.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Confirm demo order", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your demo order is confirmed" }),
  ).toBeVisible();
  const url = page.url();
  await fits(page);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const lang of ["ar", "en"]) {
      await locale(page, lang);
      await fits(page);
      await page.screenshot({
        path: info.outputPath(`order-${lang}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.goto("/account");
  await expect(page.locator(".customer-order")).toHaveCount(1);
  await page.locator(".customer-order").click();
  await expect(page).toHaveURL(url);
  await expect(page.locator(".status-pill")).toContainText("New");
});
test("admin factor enrollment and management screens work in Arabic and English on desktop and phone", async ({
  page,
  request,
}, info) => {
  const email = await account(request, "admin");
  await mutate(request, "/api/auth/sign-in/email", { email, password });
  const user = await (await request.get("/api/me/session")).json();
  adminId = user.user.id;
  expect(adminId).toMatch(/^[A-Za-z0-9_-]+$/);
  sql(`UPDATE user SET role='ADMIN' WHERE id='${adminId}';`);
  await page.goto("/admin");
  await page.evaluate(() => localStorage.setItem("maktabati-lang", "en"));
  await page.reload();
  // The language stored by i18next may differ; use the existing storefront switch.
  if ((await page.locator("html").getAttribute("lang")) !== "en") {
    await page.goto("/");
    await locale(page, "en");
    await page.goto("/admin");
  }
  await page.getByLabel("Email or admin login").fill(email);
  await page.locator(".account-form input[type=password]").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Secure your staff account" }),
  ).toBeVisible();
  await page.locator(".account-form input[type=password]").fill(password);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(
    page.getByRole("heading", { name: "Two-factor verification" }),
  ).toBeVisible();
  const secret = await page.locator(".mfa-setup input").inputValue();
  await page.locator(".account-form input").fill(totp(secret));
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Maktabati workspace" }),
  ).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const lang of ["ar", "en"]) {
      await locale(page, lang);
      await fits(page);
      await page.screenshot({
        path: info.outputPath(`admin-${lang}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.getByRole("button", { name: "Categories", exact: true }).click();
  await page.getByRole("button", { name: "Add new", exact: true }).click();
  await page.getByLabel("Arabic name").fill("قسم خيالي للاختبار");
  const name = "Fictional UI Category " + randomUUID().slice(0, 6);
  await page.getByLabel("English name").fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const row = page
    .locator(".workspace-row")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await row.getByRole("button", { name: "Edit & reorder" }).click();
  await page.getByLabel("Display order").fill("8");
  await page.getByLabel("Visible", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row).toContainText("Hidden");
  await row.getByRole("button", { name: "Delete empty category" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Accounts & permissions", exact: true })
    .click();
  await expect(page.locator(".workspace-row")).not.toHaveCount(0);
  const staffEmail = await account(request, "staff");
  // Reload through the UI so the newly verified account appears in the directory.
  await page.reload();
  await page
    .getByRole("button", { name: "Accounts & permissions", exact: true })
    .click();
  const staffRow = page
    .locator(".workspace-row")
    .filter({ hasText: staffEmail });
  await staffRow.getByRole("combobox").selectOption("STAFF");
  await staffRow.getByRole("button", { name: "Save account" }).click();
  await expect(
    staffRow.getByRole("checkbox", { name: "Edit prices", exact: true }),
  ).toBeVisible();
  await staffRow
    .getByRole("checkbox", { name: "Edit prices", exact: true })
    .check();
  await staffRow.getByRole("button", { name: "Save account" }).click();
  await expect(
    staffRow.getByRole("checkbox", { name: "Edit prices", exact: true }),
  ).toBeChecked();
  await staffRow
    .getByRole("checkbox", { name: "Edit prices", exact: true })
    .uncheck();
  await staffRow.getByRole("button", { name: "Save account" }).click();
  await expect(
    staffRow.getByRole("checkbox", { name: "Edit prices", exact: true }),
  ).not.toBeChecked();
  await staffRow.getByRole("combobox").selectOption("CUSTOMER");
  await staffRow
    .getByRole("checkbox", { name: "Disable account", exact: true })
    .check();
  await staffRow.getByRole("button", { name: "Save account" }).click();
  await page.getByRole("button", { name: "Audit log", exact: true }).click();
  await expect(page.locator(".audit-entry").first()).toBeVisible();
  await fits(page);
});

test("stale product description sends changed fields and preserves a concurrent stock edit", async ({
  page,
  request,
}) => {
  const email = await account(request, "stale-admin");
  await mutate(request, "/api/auth/sign-in/email", { email, password });
  const { user } = await (await request.get("/api/me/session")).json();
  sql(`UPDATE user SET role='ADMIN' WHERE id='${user.id}';`);
  await page.goto("/");
  await locale(page, "en");
  await page.goto("/admin");
  await page.getByLabel("Email or admin login").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const secret = await page.locator(".mfa-setup input").inputValue();
  await page.locator(".account-form input").fill(totp(secret));
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Maktabati workspace" }),
  ).toBeVisible();
  const store = await (await request.get("/api/store")).json();
  const p = store.products.find((p) => p.stock > 3);
  const row = page.locator(".workspace-row").filter({
    has: page.getByRole("heading", { name: p.name_en, exact: true }),
  });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  sql(`UPDATE products SET stock=stock-1 WHERE id=${p.id};`);
  await page
    .getByLabel("English description")
    .fill("Description from stale browser form");
  const sent = page.waitForRequest(
    (r) =>
      r.method() === "PATCH" && r.url().endsWith("/api/admin/products/" + p.id),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect((await sent).postDataJSON()).toEqual({
    description_en: "Description from stale browser form",
  });
  await expect(page.getByRole("status")).toHaveText("Saved");
  expect(
    (await (await request.get("/api/store")).json()).products.find(
      (v) => v.id === p.id,
    ).stock,
  ).toBe(p.stock - 1);
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Stock", { exact: true }).fill(String(p.stock + 1));
  sql(`UPDATE products SET stock=stock-1 WHERE id=${p.id};`);
  const stockSent = page.waitForRequest(
    (r) =>
      r.method() === "PATCH" && r.url().endsWith("/api/admin/products/" + p.id),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect((await stockSent).postDataJSON()).toEqual({
    stock: p.stock + 1,
    expected_stock: p.stock - 1,
  });
  await expect(page.getByRole("alert")).toContainText("STOCK_CHANGED");
  expect(
    (await (await request.get("/api/store")).json()).products.find(
      (v) => v.id === p.id,
    ).stock,
  ).toBe(p.stock - 2);
});

test("ADMIN username requires a first password change then TOTP; staff still signs in by email", async ({
  page,
  request,
}) => {
  const email = await account(request, "initial-admin");
  await mutate(request, "/api/auth/sign-in/email", { email, password });
  const { user } = await (await request.get("/api/me/session")).json();
  const initial = randomUUID().replaceAll("-", "").slice(0, 11);
  sql(
    `UPDATE user SET role='ADMIN',loginName='ADMIN',passwordChangeRequired=1 WHERE id='${user.id}'; UPDATE account SET password='${await hashPassword(initial)}' WHERE userId='${user.id}' AND providerId='credential';`,
  );
  await page.goto("/");
  await locale(page, "en");
  await page.goto("/admin");
  await page.getByLabel("Email or admin login").fill("ADMIN");
  await page.getByLabel("Password", { exact: true }).fill(initial);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Change your initial password" }),
  ).toBeVisible();
  expect((await page.request.get("/api/admin/data")).status()).toBe(403);
  await page.getByLabel("Password", { exact: true }).fill(initial);
  await page.getByLabel("New password (at least 12 characters)").fill(password);
  await page
    .getByRole("button", { name: "Save password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Secure your staff account" }),
  ).toBeVisible();
  expect((await page.request.get("/api/admin/data")).status()).toBe(403);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const secret = await page.locator(".mfa-setup input").inputValue();
  await page.locator(".account-form input").fill(totp(secret));
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Maktabati workspace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const staffEmail = await account(request, "staff-login");
  await mutate(request, "/api/auth/sign-in/email", {
    email: staffEmail,
    password,
  });
  const staff = await (await request.get("/api/me/session")).json();
  sql(`UPDATE user SET role='STAFF' WHERE id='${staff.user.id}';`);
  await page.goto("/admin");
  await page.getByLabel("Email or admin login").fill(staffEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Secure your staff account" }),
  ).toBeVisible();
});
