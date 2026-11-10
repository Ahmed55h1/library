import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, money, localName } from "./lib";
import { SessionGate, post, statusLabel, type User } from "./Account";
import "./account.css";
type Row = Record<string, any>;
const grants = [
  "categories.manage",
  "products.describe",
  "prices.edit",
  "stock.adjust",
  "orders.read",
  "orders.update",
];
function Workspace({ u }: { u: User }) {
  const { i18n } = useTranslation(),
    ar = i18n.language === "ar",
    s = (a: string, b: string) => (ar ? a : b),
    admin = u.role === "ADMIN",
    can = (p: string) => admin || u.permissions.includes(p);
  const [tab, setTab] = useState("products"),
    [data, setData] = useState<Row | null>(null),
    [users, setUsers] = useState<Row[]>([]),
    [audit, setAudit] = useState<Row[]>([]),
    [draft, setDraft] = useState<Row | null>(null),
    [original, setOriginal] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [nextStatus, setNextStatus] = useState("preparing");
  const labels: Record<string, string> = {
    products: s("المنتجات", "Products"),
    categories: s("الأقسام", "Categories"),
    orders: s("الطلبات", "Orders"),
    zones: s("مناطق التوصيل", "Delivery zones"),
    users: s("الحسابات والصلاحيات", "Accounts & permissions"),
    audit: s("سجل التدقيق", "Audit log"),
  };
  const fieldLabels: Record<string, string> = {
    name_ar: s("الاسم بالعربية", "Arabic name"),
    name_en: s("الاسم بالإنجليزية", "English name"),
    description_ar: s("الوصف بالعربية", "Arabic description"),
    description_en: s("الوصف بالإنجليزية", "English description"),
    price: s("السعر (د.ع)", "Price (IQD)"),
    stock: s("المخزون", "Stock"),
    sort_order: s("ترتيب العرض", "Display order"),
    visible: s("ظاهر", "Visible"),
    image_url: s("رابط الصورة", "Image URL"),
    category_id: s("القسم", "Category"),
    subject: s("المادة", "Subject"),
    academic_level: s("المرحلة", "Study level"),
    teacher_name: s("المدرس", "Teacher"),
    governorate: s("المنطقة", "Zone"),
    fee: s("رسوم التوصيل (د.ع)", "Delivery fee (IQD)"),
    enabled: s("مفعلة", "Enabled"),
  };
  const permissionLabel: Record<string, string> = {
    "categories.manage": s("إدارة الأقسام", "Manage categories"),
    "products.describe": s("تعديل أوصاف المنتجات", "Edit product descriptions"),
    "prices.edit": s("تعديل الأسعار", "Edit prices"),
    "stock.adjust": s("تعديل المخزون", "Adjust stock"),
    "orders.read": s("قراءة الطلبات", "Read orders"),
    "orders.update": s("تحديث حالة الطلب", "Update order status"),
  };
  const tabs = [
    "products",
    ...(can("categories.manage") ? ["categories"] : []),
    ...(can("orders.read") || can("orders.update") ? ["orders"] : []),
    ...(admin ? ["zones", "users", "audit"] : []),
  ];
  async function refresh() {
    setData(await api("/api/admin/data"));
    if (admin) {
      setUsers((await api("/api/admin/users")).users);
      setAudit((await api("/api/admin/audit")).entries);
    }
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(s("تم الحفظ", "Saved"));
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(row: Row) {
    setOriginal({ ...row });
    const fields =
      tab === "products"
        ? [
            "name_ar",
            "name_en",
            "description_ar",
            "description_en",
            "price",
            "stock",
            "sort_order",
            "visible",
            "image_url",
            "category_id",
            "subject",
            "academic_level",
            "teacher_name",
          ]
        : tab === "categories"
          ? ["name_ar", "name_en", "image_url", "visible", "sort_order"]
          : ["governorate", "fee", "enabled"];
    setDraft({
      id: row.id,
      ...Object.fromEntries(
        fields
          .filter(
            (k) =>
              tab !== "products" ||
              admin ||
              (k === "price"
                ? can("prices.edit")
                : k === "stock"
                  ? can("stock.adjust")
                  : ["category_id", "sort_order", "visible"].includes(k)
                    ? false
                    : can("products.describe")),
          )
          .map((k) => [k, row[k]]),
      ),
    });
  }
  function fresh() {
    setOriginal(null);
    setDraft(
      tab === "products"
        ? {
            name_ar: "",
            name_en: "",
            description_ar: "",
            description_en: "",
            price: 1000,
            stock: 10,
            category_id: data?.categories[0]?.id,
            sort_order: 0,
            visible: 1,
            image_url: "/samples/notebook.svg",
            subject: "",
            academic_level: "",
            teacher_name: "",
          }
        : tab === "categories"
          ? {
              name_ar: "",
              name_en: "",
              image_url: "/samples/notebook.svg",
              visible: 1,
              sort_order: data?.categories.length || 0,
            }
          : { governorate: "", fee: 5000, enabled: 1 },
    );
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const { id, ...fields } = draft;
    const body =
      id && tab === "products"
        ? Object.fromEntries(
            Object.entries(fields).filter(([k, v]) => v !== original?.[k]),
          )
        : fields;
    if (id && tab === "products" && "stock" in body)
      body.expected_stock = original?.stock;
    await run(async () => {
      if (Object.keys(body).length)
        await post(
          "/api/admin/" + tab + (id ? "/" + id : ""),
          body,
          id ? "PATCH" : "POST",
        );
      setDraft(null);
    });
  }
  if (!data)
    return (
      <div className="workspace">
        <a href="/account">← {s("حسابي", "My account")}</a>
        <h1>{s("إدارة المتجر", "Store workspace")}</h1>
        <p>
          {error === "NO_PERMISSIONS"
            ? s(
                "لم يمنحك المدير أي صلاحية بعد.",
                "Your administrator has not granted any permissions yet.",
              )
            : error || s("جار التحميل…", "Loading…")}
        </p>
      </div>
    );
  return (
    <div className="workspace">
      <div className="workspace-head">
        <div>
          <a href="/">← {s("المتجر", "Store")}</a>
          <h1>{s("مساحة عمل مكتبتي", "Maktabati workspace")}</h1>
          <small>
            {u.email} · {admin ? s("مدير", "Admin") : s("موظف", "Staff")} ·{" "}
            {s("تم التحقق بخطوتين", "Two-factor verified")}
          </small>
        </div>
        <div className="account-links">
          <button onClick={() => i18n.changeLanguage(ar ? "en" : "ar")}>
            {ar ? "English" : "العربية"}
          </button>
          <button
            onClick={() =>
              void post("/api/auth/sign-out", {}).then(() => location.reload())
            }
          >
            {s("تسجيل الخروج", "Sign out")}
          </button>
        </div>
      </div>
      <div className="demo-label">
        {s(
          "تجربة ببيانات خيالية — لا دفع ولا توصيل فعلي",
          "Fictional-data demo — no real payment or delivery",
        )}
      </div>
      <nav
        className="workspace-tabs"
        aria-label={s("أقسام الإدارة", "Workspace sections")}
      >
        {tabs.map((t) => (
          <button
            key={t}
            aria-selected={t === tab}
            onClick={() => {
              setTab(t);
              setDraft(null);
              setNotice("");
              setError("");
            }}
          >
            {labels[t]}
          </button>
        ))}
      </nav>
      {error && (
        <p className="error-box" role="alert">
          {s("تعذر الحفظ", "Request failed")}: {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="workspace-head">
        <h2>{labels[tab]}</h2>
        {((tab === "products" && admin) ||
          tab === "categories" ||
          tab === "zones") && (
          <button className="btn" onClick={fresh}>
            {s("إضافة جديد", "Add new")}
          </button>
        )}
      </div>
      {draft && (
        <form className="workspace-editor" onSubmit={save}>
          <h2>{draft.id ? s("تعديل", "Edit") : s("إضافة", "Create")}</h2>
          {Object.keys(draft)
            .filter((k) => k !== "id")
            .map((k) => (
              <label key={k}>
                {fieldLabels[k]}
                {k === "category_id" ? (
                  <select
                    aria-label={fieldLabels[k]}
                    value={draft[k]}
                    onChange={(e) =>
                      setDraft({ ...draft, [k]: Number(e.target.value) })
                    }
                  >
                    {data.categories.map((c: Row) => (
                      <option key={c.id} value={c.id}>
                        {localName(c as any, i18n.language)}
                      </option>
                    ))}
                  </select>
                ) : ["visible", "enabled"].includes(k) ? (
                  <select
                    aria-label={fieldLabels[k]}
                    value={draft[k]}
                    onChange={(e) =>
                      setDraft({ ...draft, [k]: Number(e.target.value) })
                    }
                  >
                    <option value={1}>{s("نعم", "Yes")}</option>
                    <option value={0}>{s("لا", "No")}</option>
                  </select>
                ) : k.startsWith("description") ? (
                  <textarea
                    value={draft[k]}
                    maxLength={10000}
                    onChange={(e) =>
                      setDraft({ ...draft, [k]: e.target.value })
                    }
                  />
                ) : (
                  <input
                    required={["name_ar", "name_en", "governorate"].includes(k)}
                    dir={
                      k.endsWith("_ar")
                        ? "rtl"
                        : k.endsWith("_en")
                          ? "ltr"
                          : undefined
                    }
                    type={typeof draft[k] === "number" ? "number" : "text"}
                    min={0}
                    step={1}
                    value={draft[k] ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [k]:
                          typeof draft[k] === "number"
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                  />
                )}
              </label>
            ))}
          <button className="btn" disabled={busy}>
            {s("حفظ", "Save")}
          </button>
          <button type="button" onClick={() => setDraft(null)}>
            {s("إلغاء", "Cancel")}
          </button>
        </form>
      )}
      {tab === "products" &&
        data.products.map((p: Row) => (
          <article className="workspace-row" key={p.id}>
            <div>
              <img src={p.image_url || "/samples/notebook.svg"} alt="" />
              <h2>{localName(p as any, i18n.language)}</h2>
              <p>
                {money(p.price, "IQD", i18n.language)} · {s("المخزون", "Stock")}
                : {p.stock} ·{" "}
                {p.visible ? s("ظاهر", "Visible") : s("مخفي", "Hidden")}
              </p>
            </div>
            <div className="account-links">
              {(admin ||
                ["products.describe", "prices.edit", "stock.adjust"].some(
                  can,
                )) && (
                <button onClick={() => edit(p)}>{s("تعديل", "Edit")}</button>
              )}
              {admin && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      post("/api/admin/products/" + p.id, {}, "DELETE"),
                    )
                  }
                >
                  {s("أرشفة", "Archive")}
                </button>
              )}
            </div>
          </article>
        ))}
      {tab === "categories" &&
        data.categories.map((c: Row) => (
          <article className="workspace-row" key={c.id}>
            <div>
              <h2>{localName(c as any, i18n.language)}</h2>
              <p>
                {s("ترتيب العرض", "Display order")}: {c.sort_order} ·{" "}
                {c.visible ? s("ظاهر", "Visible") : s("مخفي", "Hidden")}
              </p>
            </div>
            <div className="account-links">
              <button onClick={() => edit(c)}>
                {s("تعديل وترتيب", "Edit & reorder")}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    post("/api/admin/categories/" + c.id, {}, "DELETE"),
                  )
                }
              >
                {s("حذف القسم الفارغ", "Delete empty category")}
              </button>
            </div>
          </article>
        ))}
      {tab === "zones" &&
        data.deliveryRates.map((r: Row) => (
          <article className="workspace-row" key={r.governorate}>
            <div>
              <h2>{r.governorate}</h2>
              <p>
                {money(r.fee, "IQD", i18n.language)} ·{" "}
                {r.enabled ? s("مفعلة", "Enabled") : s("معطلة", "Disabled")}
              </p>
            </div>
            <button onClick={() => setDraft({ ...r })}>
              {s("تعديل", "Edit")}
            </button>
          </article>
        ))}
      {tab === "orders" && !can("orders.read") && (
        <form
          className="workspace-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() =>
              post(
                "/api/admin/orders/" + orderId,
                { status: nextStatus },
                "PATCH",
              ),
            );
          }}
        >
          <h2>{s("تحديث حالة طلب معروف", "Update a known order")}</h2>
          <p className="wide">
            {s(
              "صلاحيتك تسمح بتحديث الحالة فقط. أدخل رقم الطلب الداخلي الذي زودك به المدير.",
              "Your permission allows status updates. Enter the internal order ID supplied by your administrator.",
            )}
          </p>
          <label>
            {s("رقم الطلب الداخلي", "Internal order ID")}
            <input
              type="number"
              min="1"
              step="1"
              required
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            />
          </label>
          <label>
            {s("الحالة الجديدة", "New status")}
            <select
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value)}
            >
              {["preparing", "shipped", "completed", "cancelled"].map(
                (status) => (
                  <option key={status} value={status}>
                    {statusLabel(status, ar)}
                  </option>
                ),
              )}
            </select>
          </label>
          <button className="btn" disabled={busy}>
            {s("تحديث الحالة", "Update status")}
          </button>
        </form>
      )}
      {tab === "orders" &&
        data.orders.map((o: Row) => (
          <OrderRow
            key={o.id}
            o={o}
            ar={ar}
            canUpdate={can("orders.update")}
            busy={busy}
            run={run}
          />
        ))}
      {tab === "users" && (
        <>
          <p>
            {s(
              "يسجل الموظف حسابه أولاً ويؤكد بريده. الترقية إلى موظف تبدأ دون أي صلاحية؛ احفظ الترقية ثم امنح الصلاحيات المطلوبة.",
              "Staff register and verify their email first. Promotion starts with no permissions; save promotion before granting individual permissions.",
            )}
          </p>
          {users.map((v) => (
            <UserRow
              key={v.id + JSON.stringify(v.permissions) + v.role + v.disabled}
              v={v}
              ar={ar}
              labels={permissionLabel}
              busy={busy}
              save={(body) =>
                run(() => post("/api/admin/users/" + v.id, body, "PATCH"))
              }
            />
          ))}
        </>
      )}
      {tab === "audit" &&
        audit.map((v) => (
          <article className="audit-entry" key={v.id}>
            <strong>{v.action}</strong>
            <p>
              {v.created_at} · {s("الفاعل", "Actor")}: {v.actor_id} · {v.entity}{" "}
              #{v.entity_id}
            </p>
            <pre dir="ltr">
              {JSON.stringify(JSON.parse(v.details), null, 2)}
            </pre>
          </article>
        ))}
    </div>
  );
}
function OrderRow({
  o,
  ar,
  canUpdate,
  busy,
  run,
}: {
  o: Row;
  ar: boolean;
  canUpdate: boolean;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [detail, setDetail] = useState<Row | null>(null),
    [error, setError] = useState("");
  const next: Record<string, string[]> = {
    new: ["preparing", "cancelled"],
    preparing: ["shipped", "cancelled"],
    shipped: ["completed"],
    completed: [],
    cancelled: [],
  };
  return (
    <article className="workspace-row">
      <div>
        <h2>{o.order_number}</h2>
        <p>
          {o.customer_name} · {statusLabel(o.status, ar)} ·{" "}
          {money(o.total, "IQD", ar ? "ar" : "en")}
        </p>
        <button
          onClick={() =>
            void api("/api/admin/orders/" + o.id)
              .then(setDetail)
              .catch((e) => setError(e.message))
          }
        >
          {ar ? "تفاصيل الطلب" : "Order details"}
        </button>
        {error && <p role="alert">{error}</p>}
        {detail && (
          <div>
            <p>
              {detail.order.phone} · {detail.order.governorate} ·{" "}
              {detail.order.area} · {detail.order.address}
            </p>
            {detail.items.map((x: Row) => (
              <p key={x.id}>
                {localName(x as any, ar ? "ar" : "en")} × {x.quantity} ·{" "}
                {money(x.price, "IQD", ar ? "ar" : "en")}
              </p>
            ))}
            <p>
              {ar ? "رسوم التوصيل" : "Delivery fee"}:{" "}
              {money(detail.order.delivery_fee, "IQD", ar ? "ar" : "en")}
            </p>
          </div>
        )}
      </div>
      {canUpdate && (
        <div className="account-links">
          {next[o.status].map((status) => (
            <button
              disabled={busy}
              key={status}
              onClick={() =>
                void run(() =>
                  post("/api/admin/orders/" + o.id, { status }, "PATCH"),
                )
              }
            >
              {statusLabel(status, ar)}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
function UserRow({
  v,
  ar,
  labels,
  busy,
  save,
}: {
  v: Row;
  ar: boolean;
  labels: Record<string, string>;
  busy: boolean;
  save: (b: unknown) => Promise<void>;
}) {
  const [role, setRole] = useState(v.role),
    [disabled, setDisabled] = useState(!!v.disabled),
    [ps, setPs] = useState<string[]>(v.permissions);
  return (
    <article className="workspace-row">
      <div>
        <h2>{v.name}</h2>
        <p dir="ltr">{v.email}</p>
        <p>
          {v.role} ·{" "}
          {v.twoFactorEnabled
            ? ar
              ? "المصادقة مفعلة"
              : "2FA enrolled"
            : ar
              ? "المصادقة غير مفعلة"
              : "2FA not enrolled"}
        </p>
      </div>
      {v.role !== "ADMIN" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              role,
              disabled,
              permissions: role === "STAFF" ? ps : [],
            });
          }}
        >
          <label>
            {ar ? "نوع الحساب" : "Account role"}
            <select
              disabled={busy}
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPs([]);
              }}
            >
              <option value="CUSTOMER">{ar ? "عميل" : "Customer"}</option>
              <option value="STAFF">{ar ? "موظف" : "Staff"}</option>
            </select>
          </label>
          <div className="permissions">
            {v.role === "STAFF" &&
              role === "STAFF" &&
              grants.map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={ps.includes(p)}
                    onChange={(e) =>
                      setPs(
                        e.target.checked
                          ? [...ps, p]
                          : ps.filter((x) => x !== p),
                      )
                    }
                  />
                  {labels[p]}
                </label>
              ))}
            <label>
              <input
                type="checkbox"
                disabled={busy}
                checked={disabled}
                onChange={(e) => setDisabled(e.target.checked)}
              />
              {ar ? "تعطيل الحساب" : "Disable account"}
            </label>
          </div>
          <button className="btn" disabled={busy}>
            {ar ? "حفظ الحساب" : "Save account"}
          </button>
        </form>
      )}
    </article>
  );
}
export default function Admin() {
  return <SessionGate internal>{(u) => <Workspace u={u} />}</SessionGate>;
}
