import { test, expect, request as requestFactory } from "@playwright/test";

const base = (process.env.BASE_URL || "http://localhost:5173").replace(
  /\/$/,
  "",
);
const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=",
  "base64",
);
let cleanupTask = null;

test.afterEach(async ({}, testInfo) => {
  testInfo.setTimeout(30_000);
  const cleanup = cleanupTask;
  cleanupTask = null;
  if (!cleanup || !email || !password) return;
  // This independent context survives a timed-out test's page/request fixture teardown.
  const request = await requestFactory.newContext({
    baseURL: base,
    timeout: 8_000,
  });
  try {
    await mutate(request, "/api/auth/login", "POST", { email, password });
    await cleanup(request);
  } catch (error) {
    if (testInfo.status === "passed") throw error;
    await testInfo.attach("cleanup-error", {
      body: String(error),
      contentType: "text/plain",
    });
  } finally {
    await request.dispose();
  }
});

async function data(request) {
  const response = await request.get("/api/admin/data");
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function mutate(request, url, method, body) {
  const response = await request.fetch(url, {
    method,
    headers: { Origin: base },
    ...(body !== undefined ? { data: body } : {}),
  });
  expect(
    response.ok(),
    `${method} ${url}: ${await response.text()}`,
  ).toBeTruthy();
  return response.json();
}

async function language(page, lang) {
  if ((await page.locator("html").getAttribute("lang")) !== lang) {
    await page
      .getByRole("button", {
        name: lang === "en" ? "English" : "العربية",
        exact: true,
      })
      .click();
  }
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(page.locator("html")).toHaveAttribute(
    "dir",
    lang === "ar" ? "rtl" : "ltr",
  );
}

async function noPageOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
}

test("storefront languages, bilingual search, cart persistence, and responsive layouts", async ({
  page,
  request,
}, testInfo) => {
  const store = await (await request.get("/api/store")).json();
  const product = store.products.find((p) => p.stock > 1);
  expect(
    product,
    "Load optional local sample products before browser checks",
  ).toBeTruthy();
  const category = store.categories.find((c) => c.id === product.category_id);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.locator(".hero")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await noPageOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("storefront-ar-desktop.png"),
    fullPage: true,
  });
  await language(page, "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Good things start",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator(".hero")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("storefront-en-desktop.png"),
    fullPage: true,
  });

  await page.goto("/shop");
  await page
    .getByRole("searchbox", { name: "Search products" })
    .fill(product.name_ar);
  await expect(
    page.locator(".product-card").filter({ hasText: product.name_en }),
  ).toHaveCount(1);
  await page
    .getByRole("searchbox", { name: "Search products" })
    .fill(product.name_en);
  await expect(
    page.locator(".product-card").filter({ hasText: product.name_en }),
  ).toHaveCount(1);
  await page.goto(`/category/${category.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    category.name_en,
  );
  await language(page, "ar");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    category.name_ar,
  );
  await page.goto(`/product/${product.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    product.name_ar,
  );
  await language(page, "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    product.name_en,
  );
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Shopping bag (1)", exact: true }),
  ).toBeVisible();
  await language(page, "ar");
  await page.getByRole("link", { name: /حقيبة التسوّق \(1\)/ }).click();
  await expect(
    page.locator(".cart-row").filter({ hasText: product.name_ar }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".cart-row").filter({ hasText: product.name_ar }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("maktabati-cart")),
    ),
  ).toEqual([{ product_id: product.id, quantity: 1 }]);
  await page.getByRole("button", { name: "زيادة الكمية", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("maktabati-cart"))[0].quantity,
      ),
    )
    .toBe(2);
  await language(page, "en");
  await expect(
    page.locator(".cart-row").filter({ hasText: product.name_en }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your bag is full of possibility",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".hero")).toBeVisible();
  await noPageOverflow(page);
  await language(page, "ar");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("storefront-ar-mobile.png"),
    fullPage: true,
  });
  await page.goto("/shop");
  await expect(
    page.getByRole("searchbox", { name: "البحث عن المنتجات" }),
  ).toBeVisible();
  await noPageOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("catalog-ar-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("admin management, image upload, inventory, guest checkout, and order management", async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.skip(
    !email || !password,
    "Provide TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD for admin browser checks.",
  );
  const tag = `QA UI ${Date.now()}`;
  const categoryName = `${tag} Collection`;
  const categoryAr = `${tag} مجموعة`;
  const productName = `${tag} Notebook`;
  const productAr = `${tag} دفتر`;
  const customerName = `${tag} Customer`;
  let categoryId;
  let productId;
  let orderId;
  let bookletCategoryId;
  let guestContext;
  const baseline = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  cleanupTask = async (cleanupRequest) => {
    // Cleanup only exact IDs/names from this test; retained orders form an audit trail.
    const rows = await data(cleanupRequest);
    for (const order of rows.orders.filter(
      (o) => o.id === orderId || o.customer_name === customerName,
    )) {
      await mutate(cleanupRequest, `/api/admin/orders/${order.id}`, "PATCH", {
        status: "cancelled",
        payment_status: "unpaid",
      });
    }
    for (const p of rows.products.filter(
      (p) => p.id === productId || p.name_en === productName,
    )) {
      await mutate(cleanupRequest, `/api/admin/products/${p.id}`, "DELETE");
    }
    for (const c of rows.categories.filter(
      (c) => c.id === categoryId || c.name_en === categoryName,
    )) {
      await mutate(cleanupRequest, `/api/admin/categories/${c.id}`, "DELETE");
    }
    const remaining = (await data(cleanupRequest)).categories.map((c) => c.id);
    if (baseline.length)
      await mutate(cleanupRequest, "/api/admin/categories/reorder", "POST", {
        ids: [
          ...baseline.filter((id) => remaining.includes(id)),
          ...remaining.filter((id) => !baseline.includes(id)),
        ],
      });
  };

  try {
    const unauthorized = await request.get("/api/admin/data");
    expect(unauthorized.status()).toBe(401);
    await page.goto("/admin");
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await language(page, "en");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(`${password}-wrong`);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "email or password is incorrect",
    );
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("admin-en-desktop.png"),
      fullPage: true,
    });
    await language(page, "ar");
    await expect(page.locator(".a-main h1")).not.toHaveText("Welcome back");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("admin-ar-desktop.png"),
      fullPage: true,
    });
    await language(page, "en");

    // Use the independent API context only to verify persisted state and clean up test records.
    await mutate(request, "/api/auth/login", "POST", { email, password });
    const initialData = await data(request);
    baseline.push(...initialData.categories.map((c) => c.id));
    bookletCategoryId = (
      initialData.categories.find((c) =>
        /booklet|ملازم/i.test(`${c.name_en} ${c.name_ar}`),
      ) ||
      initialData.categories.find((c) =>
        initialData.products.some((p) => p.category_id === c.id && p.subject),
      )
    )?.id;
    await page.getByRole("button", { name: "Categories", exact: true }).click();
    await page
      .getByRole("button", { name: "Add category", exact: true })
      .click();
    let modal = page.getByRole("dialog", { name: "Add category", exact: true });
    await modal.getByLabel("Arabic name", { exact: false }).fill(categoryAr);
    await modal.getByLabel("English name", { exact: false }).fill(categoryName);
    const createdCategoryResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/categories") &&
        r.request().method() === "POST",
    );
    await modal.getByRole("button", { name: "Create", exact: true }).click();
    categoryId = (await (await createdCategoryResponse).json()).category.id;
    await expect(modal).not.toBeVisible();
    let categoryRow = page.locator(".a-category-row").filter({
      has: page.getByRole("heading", { name: categoryName, exact: true }),
    });
    await expect(categoryRow).toBeVisible();
    const before = (await data(request)).categories.map((c) => c.id);
    const reorderResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/categories/reorder") &&
        r.request().method() === "POST",
    );
    await categoryRow
      .getByRole("button", { name: `Move up ${categoryName}`, exact: true })
      .click();
    expect((await reorderResponse).ok()).toBeTruthy();
    const after = (await data(request)).categories.map((c) => c.id);
    expect(after.indexOf(categoryId)).toBe(before.indexOf(categoryId) - 1);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome back", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Categories", exact: true }).click();
    expect(
      (await page.locator(".a-category-row h2").allTextContents()).indexOf(
        categoryName,
      ),
    ).toBe(after.indexOf(categoryId));
    categoryRow = page.locator(".a-category-row").filter({
      has: page.getByRole("heading", { name: categoryName, exact: true }),
    });
    expect(after.indexOf(categoryId)).toBeGreaterThan(0);
    const dragResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/categories/reorder") &&
        r.request().method() === "POST",
    );
    await categoryRow.dragTo(page.locator(".a-category-row").first());
    expect((await dragResponse).ok()).toBeTruthy();
    expect((await data(request)).categories[0].id).toBe(categoryId);
    expect(
      (await (await request.get("/api/store")).json()).categories[0].id,
    ).toBe(categoryId);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome back", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Categories", exact: true }).click();
    await expect(page.locator(".a-category-row h2").first()).toHaveText(
      categoryName,
    );
    await language(page, "ar");
    await expect(page.locator(".a-category-row h2").first()).toHaveText(
      categoryAr,
    );
    await language(page, "en");
    await categoryRow
      .getByRole("button", { name: `Hide ${categoryName}`, exact: true })
      .click();
    await expect(
      categoryRow.getByText("Hidden", { exact: true }),
    ).toBeVisible();
    await categoryRow
      .getByRole("button", { name: `Publish ${categoryName}`, exact: true })
      .click();
    await expect(
      categoryRow.getByText("Published", { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Products & inventory", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add product", exact: true })
      .click();
    modal = page.getByRole("dialog", { name: "Add product", exact: true });
    await modal.getByLabel("Arabic name", { exact: false }).fill(productAr);
    await modal.getByLabel("English name", { exact: false }).fill(productName);
    await modal
      .getByLabel("Arabic description", { exact: true })
      .fill("دفتر اختبار ورقي مميز.");
    await modal
      .getByLabel("English description", { exact: true })
      .fill("A physical notebook created for browser testing.");
    await modal
      .getByLabel("Category", { exact: false })
      .selectOption(String(categoryId));
    await modal.getByLabel("Price", { exact: false }).fill("1750");
    await modal.getByLabel("Stock quantity", { exact: false }).fill("9");
    const imageResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/images") &&
        r.request().method() === "POST",
    );
    await modal.locator('input[type="file"]').setInputFiles({
      name: "qa-notebook.png",
      mimeType: "image/png",
      buffer: pixel,
    });
    expect((await imageResponse).ok()).toBeTruthy();
    await expect(modal.getByAltText("Product preview")).toBeVisible();
    const createdProductResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/products") &&
        r.request().method() === "POST",
    );
    await modal.getByRole("button", { name: "Create", exact: true }).click();
    productId = (await (await createdProductResponse).json()).product.id;
    await expect(modal).not.toBeVisible();
    let productRow = page.getByRole("row").filter({ hasText: productName });
    await expect(productRow).toBeVisible();
    await productRow
      .getByRole("button", { name: `Edit ${productName}`, exact: true })
      .click();
    modal = page.getByRole("dialog", { name: "Edit product", exact: true });
    await modal.getByLabel("Stock quantity", { exact: false }).fill("12");
    const inventoryResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/admin/products/${productId}`) &&
        r.request().method() === "PATCH",
    );
    await modal
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    expect((await inventoryResponse).ok()).toBeTruthy();
    await expect(modal).not.toBeVisible();
    expect(
      (await data(request)).products.find((p) => p.id === productId).stock,
    ).toBe(12);

    guestContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      baseURL: base,
    });
    const guest = await guestContext.newPage();
    guest.on("pageerror", (error) => errors.push(error.message));
    await guest.goto("/");
    await expect(guest.locator(".hero")).toBeVisible();
    await language(guest, "en");
    if (bookletCategoryId) {
      const bookletLinks = guest.getByRole("link", {
        name: "Shop study booklets",
        exact: true,
      });
      await expect(bookletLinks).toHaveCount(2);
      await expect(bookletLinks.nth(0)).toHaveAttribute(
        "href",
        `/category/${bookletCategoryId}`,
      );
      await expect(bookletLinks.nth(1)).toHaveAttribute(
        "href",
        `/category/${bookletCategoryId}`,
      );
    }
    await language(guest, "ar");
    await guest.goto(`/product/${productId}`);
    await expect(guest.getByRole("heading", { level: 1 })).toHaveText(
      productAr,
    );
    await language(guest, "en");
    await expect(guest.getByRole("heading", { level: 1 })).toHaveText(
      productName,
    );
    await guest
      .getByRole("button", { name: "Increase quantity", exact: true })
      .click();
    await guest
      .getByRole("button", { name: "Add to bag", exact: true })
      .click();
    await guest
      .getByRole("link", { name: "Shopping bag (2)", exact: true })
      .click();
    await guest
      .getByRole("link", { name: "Continue to checkout", exact: true })
      .click();
    await expect(guest.getByRole("heading", { level: 1 })).toContainText(
      "One step closer",
    );
    await guest
      .getByRole("button", { name: "Place order", exact: true })
      .click();
    await expect(
      guest.getByText("This field is required", { exact: true }),
    ).toHaveCount(5);
    await guest.getByLabel("Full name", { exact: false }).fill(customerName);
    await expect(
      guest.getByText("This field is required", { exact: true }),
    ).toHaveCount(4);
    await expect(
      guest.getByLabel("Full name", { exact: true }),
    ).toHaveAttribute("aria-invalid", "false");
    await guest
      .getByLabel("Phone number", { exact: false })
      .fill("07701234567");
    await guest
      .getByLabel("Governorate", { exact: false })
      .selectOption("Baghdad");
    await expect(
      guest.getByText("This field is required", { exact: true }),
    ).toHaveCount(2);
    await expect(
      guest.getByRole("combobox", { name: "Governorate", exact: true }),
    ).toHaveAttribute("aria-invalid", "false");
    await guest
      .getByLabel("Area or district", { exact: false })
      .fill("QA district");
    await guest
      .getByLabel("Full address", { exact: false })
      .fill("QA street, building 4. Test order; do not fulfil.");
    await guest
      .getByLabel("Additional notes (optional)", { exact: false })
      .fill("Automated browser test. Do not fulfil.");
    await expect(
      guest.getByText("This field is required", { exact: true }),
    ).toHaveCount(0);
    await expect(guest.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(
      guest.getByText("Online payment is currently unavailable", {
        exact: true,
      }),
    ).toBeVisible();
    await noPageOverflow(guest);
    await guest.evaluate(() => window.scrollTo(0, 0));
    await guest.screenshot({
      path: testInfo.outputPath("checkout-en-mobile.png"),
      fullPage: true,
    });
    const orderResponse = guest.waitForResponse(
      (r) => r.url().endsWith("/api/orders") && r.request().method() === "POST",
    );
    await guest
      .getByRole("button", { name: "Place order", exact: true })
      .click();
    const receivedOrder = await orderResponse;
    expect(receivedOrder.ok(), await receivedOrder.text()).toBeTruthy();
    const orderResult = await receivedOrder.json();
    orderId = orderResult.order.id;
    expect(orderResult.order.subtotal).toBe(3500);
    const publicStore = await (await request.get("/api/store")).json();
    const deliveryFee = publicStore.deliveryRates.find(
      (r) => r.governorate === "Baghdad",
    ).fee;
    expect(orderResult.order.total).toBe(3500 + deliveryFee);
    await expect(guest).toHaveURL(/\/order\/\d+\?token=/);
    await expect(guest.getByRole("heading", { level: 1 })).toContainText(
      "Thank you!",
    );
    await expect(
      guest.getByText(orderResult.order.order_number, { exact: true }),
    ).toBeVisible();
    await guest.reload();
    await expect(guest.getByRole("heading", { level: 1 })).toContainText(
      "Thank you!",
    );
    await language(guest, "ar");
    await expect(guest.getByRole("heading", { level: 1 })).toHaveText(
      "شكراً! طلبك صار عندنا.",
    );
    expect(
      (await data(request)).products.find((p) => p.id === productId).stock,
    ).toBe(10);
    await guest.evaluate(() => window.scrollTo(0, 0));
    await guest.screenshot({
      path: testInfo.outputPath("order-ar-mobile.png"),
      fullPage: true,
    });

    await page.getByRole("button", { name: "Orders", exact: true }).click();
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page
      .getByRole("textbox", {
        name: "Search order number, customer or phone…",
        exact: true,
      })
      .fill(orderResult.order.order_number);
    const orderRow = page
      .getByRole("row")
      .filter({ hasText: orderResult.order.order_number });
    await expect(orderRow).toContainText(customerName);
    await orderRow
      .getByRole("button", {
        name: `View details ${orderResult.order.order_number}`,
        exact: true,
      })
      .click();
    modal = page.getByRole("dialog");
    await expect(modal).toContainText(productName);
    await expect(modal).toContainText("Unpaid");
    await modal
      .getByRole("combobox", { name: "Order status", exact: true })
      .selectOption("preparing");
    await modal
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await data(request)).orders.find((o) => o.id === orderId).status,
      )
      .toBe("preparing");
    await expect(
      modal.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeEnabled();
    await modal.getByRole("button", { name: "Close", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await noPageOverflow(page);
    await language(page, "ar");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("admin-orders-ar-mobile.png"),
      fullPage: true,
    });
    await language(page, "en");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("button", {
        name: `View details ${orderResult.order.order_number}`,
        exact: true,
      })
      .click();
    modal = page.getByRole("dialog");
    await modal
      .getByRole("combobox", { name: "Order status", exact: true })
      .selectOption("cancelled");
    await modal
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await data(request)).products.find((p) => p.id === productId).stock,
      )
      .toBe(12);
    await expect(
      modal.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeEnabled();
    await modal.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Products & inventory", exact: true })
      .click();
    productRow = page.getByRole("row").filter({ hasText: productName });
    await productRow
      .getByRole("button", { name: `Delete ${productName}`, exact: true })
      .click();
    modal = page.getByRole("dialog");
    await modal
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await expect(modal).not.toBeVisible();
    await expect(productRow).toHaveCount(0);
    await page.getByRole("button", { name: "Categories", exact: true }).click();
    categoryRow = page.locator(".a-category-row").filter({
      has: page.getByRole("heading", { name: categoryName, exact: true }),
    });
    await categoryRow
      .getByRole("button", { name: `Delete ${categoryName}`, exact: true })
      .click();
    modal = page.getByRole("dialog");
    await modal
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await expect(modal).not.toBeVisible();
    await expect(categoryRow).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await guestContext?.close().catch(() => {});
  }
});
