import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { api, money, localName } from "./lib";
import type {
  Category,
  Product,
  Settings,
  Order,
  OrderItem,
  DeliveryRate,
} from "./types";
import "./admin.css";

type Tab = "dashboard" | "categories" | "products" | "orders" | "settings";
type Data = {
  categories: Category[];
  products: Product[];
  orders: Order[];
  settings: Settings;
  deliveryRates: DeliveryRate[];
  stats: { orders: number; sales: number; lowStock: number };
};
type CategoryDraft = {
  id?: number;
  name_ar: string;
  name_en: string;
  image_url: string;
  visible: number;
  sort_order: number;
};
type ProductDraft = Omit<Product, "id" | "created_at"> & { id?: number };
const statuses = ["new", "preparing", "shipped", "completed", "cancelled"];
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const emptyCategory: CategoryDraft = {
  name_ar: "",
  name_en: "",
  image_url: "",
  visible: 1,
  sort_order: 0,
};
const emptyProduct = (category_id: number): ProductDraft => ({
  category_id,
  name_ar: "",
  name_en: "",
  description_ar: "",
  description_en: "",
  price: 1000,
  stock: 0,
  image_url: "",
  visible: 1,
  sort_order: 0,
  subject: "",
  academic_level: "",
  teacher_name: "",
});

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const { t } = useTranslation("admin");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const elements = ref.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]",
        );
        if (!elements?.length) return;
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="a-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`a-modal ${wide ? "a-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <div className="a-modal-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="a-icon"
            aria-label={t("close")}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ImageField({
  value,
  onChange,
  label,
  onError,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  onError: (e: unknown) => void;
}) {
  const { t } = useTranslation("admin");
  const [uploading, setUploading] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      onError(new Error("IMAGE_INVALID"));
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await api<{ url: string }>("/api/admin/images", {
        method: "POST",
        body: form,
      });
      onChange(result.url);
    } catch (e) {
      onError(e);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="a-field">
      <span>{label || t("image")}</span>
      <div className="a-image-field">
        {value ? (
          <img src={value} alt={t("imageAlt")} />
        ) : (
          <ImagePlus size={28} />
        )}
        <div>
          <label className="a-button a-button-secondary a-upload">
            {uploading ? (
              <LoaderCircle className="a-spin" size={16} />
            ) : (
              <ImagePlus size={16} />
            )}{" "}
            {t("upload")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <small>{t("imageHint")}</small>
          {value && (
            <button
              type="button"
              className="a-link a-danger-text"
              onClick={() => onChange("")}
            >
              {t("removeImage")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Admin({ storeSettings }: { storeSettings?: Settings }) {
  const { t, i18n } = useTranslation("admin");
  const lang = i18n.language.startsWith("ar") ? "ar" : "en";
  useEffect(() => {
    const invalid = (event: Event) => {
      const field = event.target as HTMLInputElement;
      if (typeof field.setCustomValidity === "function")
        field.setCustomValidity(t("invalidField"));
    };
    const reset = (event: Event) => {
      const field = event.target as HTMLInputElement;
      if (typeof field.setCustomValidity === "function")
        field.setCustomValidity("");
    };
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("input", reset, true);
    return () => {
      document.removeEventListener("invalid", invalid, true);
      document.removeEventListener("input", reset, true);
    };
  }, [t]);
  const [admin, setAdmin] = useState<{ id: number; email: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(
    null,
  );
  const [productDraft, setProductDraft] = useState<ProductDraft | null>(null);
  const [deleting, setDeleting] = useState<{
    type: "categories" | "products";
    id: number;
  } | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [orderDetail, setOrderDetail] = useState<{
    order: Order;
    items: OrderItem[];
  } | null>(null);
  const [orderStatus, setOrderStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rates, setRates] = useState<DeliveryRate[]>([]);
  const fail = (e: unknown) => {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    if (/UNAUTHORIZED|AUTH_REQUIRED/.test(code)) {
      setAdmin(null);
      setData(null);
    }
    setNotice({
      text:
        code === "IMAGE_INVALID"
          ? t("imageInvalid")
          : i18n.t(`errors.${code}`, {
              ns: "common",
              defaultValue: t("error"),
            }),
      error: true,
    });
  };
  const refresh = async () => {
    const next = await api<Data>("/api/admin/data");
    setData(next);
    setSettings(next.settings);
    setRates(next.deliveryRates);
  };
  useEffect(() => {
    void (async () => {
      try {
        const me = await api<{ admin: { id: number; email: string } | null }>(
          "/api/auth/me",
        );
        setAdmin(me.admin);
        if (me.admin) await refresh();
      } catch (e) {
        fail(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(
      () => setNotice(null),
      notice.error ? 12000 : 4500,
    );
    return () => window.clearTimeout(timer);
  }, [notice]);
  const execute = async (action: () => Promise<void>, success = "saved") => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await refresh();
      setNotice({ text: t(success) });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await api("/api/auth/login", json("POST", { email, password }));
      const me = await api<{ admin: { id: number; email: string } }>(
        "/api/auth/me",
      );
      setAdmin(me.admin);
      setPassword("");
      await refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
      setAdmin(null);
      setData(null);
      setPassword("");
    } catch (e) {
      fail(e);
    }
  };
  const currency = data?.settings.currency || "IQD";
  const price = (amount: number) => money(amount, currency, lang);
  const orderMoney = (amount: number, order: Order) =>
    money(
      amount,
      (order as Order & { currency?: string }).currency || currency,
      lang,
    );
  const date = (value: string) => {
    const parsed = new Date(
      value.includes("T") ? value : value.replace(" ", "T") + "Z",
    );
    return Number.isNaN(parsed.getTime())
      ? value
      : new Intl.DateTimeFormat(lang === "ar" ? "ar-IQ" : "en-GB", {
          dateStyle: "medium",
        }).format(parsed);
  };
  const categories = [...(data?.categories || [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  );
  const products = [...(data?.products || [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  );
  const allOrders = [...(data?.orders || [])].sort((a, b) => b.id - a.id);
  const filteredProducts = products.filter(
    (p) =>
      (!categoryFilter || p.category_id === Number(categoryFilter)) &&
      (!visibilityFilter || p.visible === Number(visibilityFilter)) &&
      `${p.name_ar} ${p.name_en} ${p.subject || ""} ${p.teacher_name || ""}`
        .toLocaleLowerCase()
        .includes(productQuery.toLocaleLowerCase()),
  );
  const filteredOrders = allOrders.filter(
    (o) =>
      (!statusFilter || o.status === statusFilter) &&
      (!paymentFilter || o.payment_status === paymentFilter) &&
      `${o.order_number} ${o.customer_name} ${o.phone}`
        .toLocaleLowerCase()
        .includes(orderQuery.toLocaleLowerCase()),
  );
  const categoryName = (id: number) => {
    const c = categories.find((x) => x.id === id);
    return c ? localName(c, lang) : "—";
  };
  const moveCategory = (id: number, offset: number) => {
    const list = [...categories];
    const index = list.findIndex((c) => c.id === id);
    if (index + offset < 0 || index + offset >= list.length) return;
    [list[index], list[index + offset]] = [list[index + offset], list[index]];
    void execute(async () => {
      await api(
        "/api/admin/categories/reorder",
        json("POST", { ids: list.map((c) => c.id) }),
      );
    });
  };
  const dropCategory = (targetId: number) => {
    if (dragId === null || dragId === targetId) return;
    const list = [...categories];
    const from = list.findIndex((c) => c.id === dragId);
    const [item] = list.splice(from, 1);
    list.splice(
      list.findIndex((c) => c.id === targetId),
      0,
      item,
    );
    setDragId(null);
    void execute(async () => {
      await api(
        "/api/admin/categories/reorder",
        json("POST", { ids: list.map((c) => c.id) }),
      );
    });
  };
  const moveProduct = (product: Product, offset: number) => {
    const list = products.filter((p) => p.category_id === product.category_id);
    const index = list.findIndex((p) => p.id === product.id);
    if (index + offset < 0 || index + offset >= list.length) return;
    [list[index], list[index + offset]] = [list[index + offset], list[index]];
    void execute(async () => {
      await api(
        "/api/admin/products/reorder",
        json("POST", {
          category_id: product.category_id,
          ids: list.map((p) => p.id),
        }),
      );
    });
  };
  const openOrder = async (id: number) => {
    setBusy(true);
    try {
      const detail = await api<{ order: Order; items: OrderItem[] }>(
        `/api/admin/orders/${id}`,
      );
      setOrderDetail(detail);
      setOrderStatus(detail.order.status);
      setPaymentStatus(detail.order.payment_status);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const submitCategory = (e: FormEvent) => {
    e.preventDefault();
    if (!categoryDraft) return;
    void execute(async () => {
      await api(
        `/api/admin/categories${categoryDraft.id ? `/${categoryDraft.id}` : ""}`,
        json(categoryDraft.id ? "PATCH" : "POST", categoryDraft),
      );
      setCategoryDraft(null);
    });
  };
  const submitProduct = (e: FormEvent) => {
    e.preventDefault();
    if (!productDraft) return;
    void execute(async () => {
      const body = productDraft.id
        ? {
            ...productDraft,
            expected_stock: data?.products.find((p) => p.id === productDraft.id)
              ?.stock,
          }
        : productDraft;
      await api(
        `/api/admin/products${productDraft.id ? `/${productDraft.id}` : ""}`,
        json(productDraft.id ? "PATCH" : "POST", body),
      );
      setProductDraft(null);
    });
  };
  const orderTable = (rows: Order[]) => (
    <div className="a-table-wrap">
      <table className="a-table">
        <thead>
          <tr>
            <th>{t("orderNumber")}</th>
            <th>{t("customer")}</th>
            <th>{t("date")}</th>
            <th>{t("total")}</th>
            <th>{t("orderStatus")}</th>
            <th>{t("paymentStatus")}</th>
            <th>
              <span className="a-sr-only">{t("actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td>
                <strong dir="ltr">{o.order_number}</strong>
              </td>
              <td>
                {o.customer_name}
                <small className="a-muted" dir="ltr">
                  {o.phone}
                </small>
              </td>
              <td className="a-nowrap">{date(o.created_at)}</td>
              <td className="a-nowrap">{orderMoney(o.total, o)}</td>
              <td>
                <span className={`a-badge a-status-${o.status}`}>
                  {t(`status.${o.status}`)}
                </span>
              </td>
              <td>
                <span className={`a-payment-${o.payment_status}`}>
                  {t(`payment.${o.payment_status}`)}
                </span>
              </td>
              <td>
                <button
                  className="a-icon"
                  onClick={() => void openOrder(o.id)}
                  title={t("details")}
                  aria-label={`${t("details")} ${o.order_number}`}
                  disabled={busy}
                >
                  <ArrowUpRight size={19} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="a-empty">
          <ShoppingBag size={32} />
          <p>{t("noOrders")}</p>
        </div>
      )}
    </div>
  );
  const noticeView = notice && (
    <div
      className={`a-notice ${notice.error ? "a-notice-error" : ""}`}
      role={notice.error ? "alert" : "status"}
    >
      <span>{notice.text}</span>
      <button
        className="a-icon"
        onClick={() => setNotice(null)}
        aria-label={t("close")}
      >
        <X size={17} />
      </button>
    </div>
  );
  if (loading)
    return (
      <div className="admin a-loading">
        <LoaderCircle className="a-spin" size={30} />
        <p>{t("loading")}</p>
      </div>
    );
  if (!admin)
    return (
      <div className="admin a-login">
        <div className="a-login-art">
          <a className="a-brand" href="/">
            <span className="a-brand-symbol">
              <BookOpen size={26} />
            </span>
            <span>
              {storeSettings
                ? localName(storeSettings, lang)
                : i18n.t("brand", { ns: "common" })}
              <small>{storeSettings?.name_en || "Maktabati"}</small>
            </span>
          </a>
          <div>
            <span className="a-eyebrow">
              <ShieldCheck size={16} />
              {t("secureAdmin")}
            </span>
            <h1>{t("loginTitle")}</h1>
            <p>{t("loginNote")}</p>
            <div className="a-login-decoration">
              <BookOpen size={100} strokeWidth={1} />
              <Pencil size={80} strokeWidth={1} />
            </div>
          </div>
          <a className="a-login-back" href="/">
            <ExternalLink size={16} />
            {t("storefront")}
          </a>
        </div>
        <div className="a-login-content">
          <button
            className="a-language"
            onClick={() =>
              void i18n.changeLanguage(lang === "ar" ? "en" : "ar")
            }
          >
            {lang === "ar" ? "English" : "العربية"}
          </button>
          <div className="a-login-form">
            <span className="a-eyebrow">{t("title")}</span>
            <h2>{t("welcome")}</h2>
            {noticeView}
            <form onSubmit={(e) => void login(e)}>
              <label className="a-field">
                {t("email")}
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                />
              </label>
              <label className="a-field">
                {t("password")}
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                />
              </label>
              <button className="a-button a-login-submit" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="a-spin" size={17} />
                ) : (
                  <ShieldCheck size={17} />
                )}{" "}
                {t(busy ? "signingIn" : "signIn")}
              </button>
            </form>
            <div className="a-bootstrap">
              <strong>{t("firstAdmin")}</strong>
              <p>{t("firstAdminNote")}</p>
              <code dir="ltr">
                npm run admin:create -- --email you@example.com
              </code>
            </div>
          </div>
        </div>
      </div>
    );
  if (!data || !settings)
    return (
      <div className="admin a-loading">
        {noticeView}
        <button className="a-button" onClick={() => void execute(refresh)}>
          {t("refresh")}
        </button>
      </div>
    );
  const navigation = [
    { id: "dashboard", icon: LayoutDashboard },
    { id: "categories", icon: Tags },
    { id: "products", icon: Package },
    { id: "orders", icon: ShoppingBag },
    { id: "settings", icon: Settings2 },
  ] as const;
  return (
    <div className="admin a-shell">
      <aside className="a-sidebar">
        <a className="a-brand" href="/">
          <span className="a-brand-symbol">
            {data.settings.logo_url ? (
              <img src={data.settings.logo_url} alt="" />
            ) : (
              <BookOpen size={25} />
            )}
          </span>
          <span>
            {localName(data.settings, lang)}
            <small>{t("title")}</small>
          </span>
        </a>
        <nav aria-label={t("title")}>
          {navigation.map(({ id, icon: Icon }) => (
            <button
              key={id}
              className={`a-nav-item ${tab === id ? "active" : ""}`}
              onClick={() => {
                setTab(id);
                setNotice(null);
              }}
            >
              <Icon size={19} />
              <span>{t(id)}</span>
              {id === "orders" && allOrders.some((o) => o.status === "new") && (
                <span className="a-nav-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="a-sidebar-bottom">
          <a href="/" className="a-nav-item">
            <ExternalLink size={18} />
            <span>{t("storefront")}</span>
          </a>
          <button className="a-nav-item" onClick={() => void logout()}>
            <LogOut size={18} />
            <span>{t("logout")}</span>
          </button>
          <div className="a-admin-email">
            <ShieldCheck size={15} />
            <span dir="ltr">{admin.email}</span>
          </div>
        </div>
      </aside>
      <div className="a-workspace">
        <header className="a-topbar">
          <div>
            <span className="a-muted">{t("title")}</span>
            <ChevronRight size={13} />
            <strong>{t(tab)}</strong>
          </div>
          <div className="a-topbar-actions">
            <button
              className="a-icon"
              aria-label={t("refresh")}
              disabled={busy}
              onClick={() => void execute(refresh)}
            >
              <RefreshCw size={17} className={busy ? "a-spin" : ""} />
            </button>
            <button
              className="a-language"
              onClick={() =>
                void i18n.changeLanguage(lang === "ar" ? "en" : "ar")
              }
            >
              {lang === "ar" ? "English" : "العربية"}
            </button>
            <button
              className="a-icon a-mobile-logout"
              title={t("logout")}
              aria-label={t("logout")}
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </button>
            <span className="a-avatar">
              {admin.email.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="a-main">
          {noticeView}
          <div className="a-page-heading">
            <div>
              <span className="a-eyebrow">
                {localName(data.settings, lang)} / {t("title")}
              </span>
              <h1>{t(tab === "dashboard" ? "welcome" : tab)}</h1>
              <p>
                {t(
                  tab === "dashboard"
                    ? "overviewNote"
                    : tab === "categories"
                      ? "categoryNote"
                      : tab === "products"
                        ? "productNote"
                        : tab === "orders"
                          ? "orderNote"
                          : "storeSettingsNote",
                )}
              </p>
            </div>
            {tab === "categories" && (
              <button
                className="a-button"
                onClick={() =>
                  setCategoryDraft({
                    ...emptyCategory,
                    sort_order: categories.length,
                  })
                }
              >
                <Plus size={18} />
                {t("newCategory")}
              </button>
            )}
            {tab === "products" && (
              <button
                className="a-button"
                disabled={!categories.length}
                onClick={() =>
                  setProductDraft(
                    emptyProduct(Number(categoryFilter) || categories[0]?.id),
                  )
                }
              >
                <Plus size={18} />
                {t("newProduct")}
              </button>
            )}
          </div>
          {tab === "dashboard" && (
            <>
              <div className="a-stat-grid">
                <div className="a-stat">
                  <span className="a-stat-icon">
                    <ShoppingBag size={22} />
                  </span>
                  <span>{t("totalOrders")}</span>
                  <strong>
                    {new Intl.NumberFormat(lang).format(data.stats.orders)}
                  </strong>
                </div>
                <div className="a-stat a-stat-green">
                  <span className="a-stat-icon">
                    <CircleDollarSign size={22} />
                  </span>
                  <span>{t("sales")}</span>
                  <strong>{price(data.stats.sales)}</strong>
                </div>
                <div className="a-stat a-stat-peach">
                  <span className="a-stat-icon">
                    <Package size={22} />
                  </span>
                  <span>{t("lowStock")}</span>
                  <strong>
                    {new Intl.NumberFormat(lang).format(data.stats.lowStock)}
                  </strong>
                </div>
              </div>
              <section className="a-panel">
                <div className="a-panel-head">
                  <h2>{t("recentOrders")}</h2>
                  <button className="a-link" onClick={() => setTab("orders")}>
                    {t("allOrders")}
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                {orderTable(allOrders.slice(0, 5))}
              </section>
              <section className="a-panel">
                <div className="a-panel-head">
                  <h2>{t("stockAttention")}</h2>
                  <Package size={18} />
                </div>
                <div className="a-stock-list">
                  {products
                    .filter((p) => p.stock <= data.settings.low_stock_threshold)
                    .slice(0, 8)
                    .map((p) => (
                      <button
                        key={p.id}
                        className="a-stock-row"
                        onClick={() => setProductDraft({ ...p })}
                      >
                        <div className="a-product-name">
                          {p.image_url && <img src={p.image_url} alt="" />}
                          <span>
                            {localName(p, lang)}
                            <small>{categoryName(p.category_id)}</small>
                          </span>
                        </div>
                        <span
                          className={`a-badge ${p.stock === 0 ? "a-status-cancelled" : "a-status-preparing"}`}
                        >
                          {t("units", {
                            value: new Intl.NumberFormat(lang).format(p.stock),
                          })}
                        </span>
                      </button>
                    ))}
                  {!products.some(
                    (p) => p.stock <= data.settings.low_stock_threshold,
                  ) && <p className="a-empty">{t("noLowStock")}</p>}
                </div>
              </section>
            </>
          )}
          {tab === "categories" && (
            <div className="a-category-list">
              {categories.map((c, index) => (
                <section
                  key={c.id}
                  className={`a-category-row ${dragId === c.id ? "a-dragging" : ""}`}
                  draggable={!busy}
                  onDragStart={(e) => {
                    setDragId(c.id);
                    e.dataTransfer.setData("text/plain", String(c.id));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropCategory(c.id);
                  }}
                  onDragEnd={() => setDragId(null)}
                >
                  <span className="a-drag-handle" title={t("drag")}>
                    <GripVertical size={20} />
                  </span>
                  <span className="a-category-thumbnail">
                    {c.image_url ? (
                      <img src={c.image_url} alt="" />
                    ) : (
                      <Tags size={26} />
                    )}
                  </span>
                  <div className="a-category-name">
                    <h2>{localName(c, lang)}</h2>
                    <p dir={lang === "ar" ? "ltr" : "rtl"}>
                      {lang === "ar" ? c.name_en : c.name_ar}
                    </p>
                    <small>
                      {t("productCount", {
                        value: new Intl.NumberFormat(lang).format(
                          products.filter((p) => p.category_id === c.id).length,
                        ),
                      })}
                    </small>
                  </div>
                  <span
                    className={`a-badge ${c.visible ? "a-status-completed" : ""}`}
                  >
                    {t(c.visible ? "visible" : "hidden")}
                  </span>
                  <div className="a-row-actions">
                    <button
                      className="a-icon"
                      aria-label={`${t("moveUp")} ${localName(c, lang)}`}
                      disabled={busy || index === 0}
                      onClick={() => moveCategory(c.id, -1)}
                    >
                      <ArrowUp size={17} />
                    </button>
                    <button
                      className="a-icon"
                      aria-label={`${t("moveDown")} ${localName(c, lang)}`}
                      disabled={busy || index === categories.length - 1}
                      onClick={() => moveCategory(c.id, 1)}
                    >
                      <ArrowDown size={17} />
                    </button>
                    <button
                      className="a-icon"
                      aria-label={`${t(c.visible ? "hide" : "publish")} ${localName(c, lang)}`}
                      disabled={busy}
                      onClick={() =>
                        void execute(async () => {
                          await api(
                            `/api/admin/categories/${c.id}`,
                            json("PATCH", { ...c, visible: c.visible ? 0 : 1 }),
                          );
                        })
                      }
                    >
                      {c.visible ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                    <button
                      className="a-icon"
                      aria-label={`${t("edit")} ${localName(c, lang)}`}
                      onClick={() => setCategoryDraft({ ...c })}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      className="a-icon a-danger-text"
                      aria-label={`${t("delete")} ${localName(c, lang)}`}
                      onClick={() => {
                        setDeleting({ type: "categories", id: c.id });
                        setMoveTo("");
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </section>
              ))}
              {!categories.length && (
                <section className="a-panel a-empty">
                  <Tags size={34} />
                  <p>{t("noCategories")}</p>
                </section>
              )}
            </div>
          )}
          {tab === "products" && (
            <section className="a-panel">
              <div className="a-filters">
                <label className="a-search">
                  <Search size={17} />
                  <input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder={t("searchProducts")}
                    aria-label={t("searchProducts")}
                  />
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label={t("category")}
                >
                  <option value="">{t("allCategories")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {localName(c, lang)}
                    </option>
                  ))}
                </select>
                <select
                  value={visibilityFilter}
                  onChange={(e) => setVisibilityFilter(e.target.value)}
                  aria-label={t("visibility")}
                >
                  <option value="">{t("allVisibility")}</option>
                  <option value="1">{t("visible")}</option>
                  <option value="0">{t("hidden")}</option>
                </select>
              </div>
              <p className="a-table-hint">{t("sortHint")}</p>
              <div className="a-table-wrap">
                <table className="a-table">
                  <thead>
                    <tr>
                      <th>{t("product")}</th>
                      <th>{t("category")}</th>
                      <th>{t("price")}</th>
                      <th>{t("stock")}</th>
                      <th>{t("visibility")}</th>
                      <th>{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => {
                      const peers = products.filter(
                        (x) => x.category_id === p.category_id,
                      );
                      const index = peers.findIndex((x) => x.id === p.id);
                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="a-product-name">
                              {p.image_url ? (
                                <img src={p.image_url} alt="" />
                              ) : (
                                <span className="a-product-placeholder">
                                  <Package size={22} />
                                </span>
                              )}
                              <span>
                                <strong>{localName(p, lang)}</strong>
                                <small dir={lang === "ar" ? "ltr" : "rtl"}>
                                  {lang === "ar" ? p.name_en : p.name_ar}
                                </small>
                              </span>
                            </div>
                          </td>
                          <td>{categoryName(p.category_id)}</td>
                          <td className="a-nowrap">{price(p.price)}</td>
                          <td>
                            <span
                              className={`a-badge ${p.stock === 0 ? "a-status-cancelled" : p.stock <= data.settings.low_stock_threshold ? "a-status-preparing" : ""}`}
                            >
                              {new Intl.NumberFormat(lang).format(p.stock)}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`a-badge ${p.visible ? "a-status-completed" : ""}`}
                            >
                              {t(p.visible ? "visible" : "hidden")}
                            </span>
                          </td>
                          <td>
                            <div className="a-row-actions">
                              {categoryFilter && (
                                <>
                                  <button
                                    className="a-icon"
                                    disabled={busy || index === 0}
                                    aria-label={`${t("moveUp")} ${localName(p, lang)}`}
                                    onClick={() => moveProduct(p, -1)}
                                  >
                                    <ArrowUp size={16} />
                                  </button>
                                  <button
                                    className="a-icon"
                                    disabled={
                                      busy || index === peers.length - 1
                                    }
                                    aria-label={`${t("moveDown")} ${localName(p, lang)}`}
                                    onClick={() => moveProduct(p, 1)}
                                  >
                                    <ArrowDown size={16} />
                                  </button>
                                </>
                              )}
                              <button
                                className="a-icon"
                                aria-label={`${t("edit")} ${localName(p, lang)}`}
                                onClick={() => setProductDraft({ ...p })}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                className="a-icon a-danger-text"
                                aria-label={`${t("delete")} ${localName(p, lang)}`}
                                onClick={() =>
                                  setDeleting({ type: "products", id: p.id })
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!filteredProducts.length && (
                  <div className="a-empty">
                    <Package size={32} />
                    <p>{t("noProducts")}</p>
                  </div>
                )}
              </div>
            </section>
          )}
          {tab === "orders" && (
            <section className="a-panel">
              <div className="a-filters">
                <label className="a-search">
                  <Search size={17} />
                  <input
                    value={orderQuery}
                    onChange={(e) => setOrderQuery(e.target.value)}
                    placeholder={t("searchOrders")}
                    aria-label={t("searchOrders")}
                  />
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label={t("orderStatus")}
                >
                  <option value="">{t("allStatuses")}</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </select>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  aria-label={t("paymentStatus")}
                >
                  <option value="">{t("allPayments")}</option>
                  <option value="paid">{t("payment.paid")}</option>
                  <option value="unpaid">{t("payment.unpaid")}</option>
                </select>
              </div>
              {orderTable(filteredOrders)}
            </section>
          )}
          {tab === "settings" && (
            <form
              className="a-settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void execute(async () => {
                  await api(
                    "/api/admin/settings",
                    json("PATCH", { ...settings, deliveryRates: rates }),
                  );
                });
              }}
            >
              <section className="a-panel a-settings-panel">
                <h2>{t("storeIdentity")}</h2>
                <div className="a-form-grid">
                  <label className="a-field">
                    {t("nameAr")} *
                    <input
                      required
                      dir="rtl"
                      maxLength={150}
                      value={settings.name_ar}
                      onChange={(e) =>
                        setSettings({ ...settings, name_ar: e.target.value })
                      }
                    />
                  </label>
                  <label className="a-field">
                    {t("nameEn")} *
                    <input
                      required
                      dir="ltr"
                      maxLength={150}
                      value={settings.name_en}
                      onChange={(e) =>
                        setSettings({ ...settings, name_en: e.target.value })
                      }
                    />
                  </label>
                </div>
                <ImageField
                  label={t("logo")}
                  value={settings.logo_url || ""}
                  onChange={(logo_url) =>
                    setSettings({ ...settings, logo_url })
                  }
                  onError={fail}
                />
                <div className="a-form-grid">
                  <label className="a-field">
                    {t("currency")}
                    <select
                      value={settings.currency}
                      onChange={(e) =>
                        setSettings({ ...settings, currency: e.target.value })
                      }
                    >
                      <option value="IQD">
                        IQD — {t("currencyNames.IQD")}
                      </option>
                      <option value="USD">
                        USD — {t("currencyNames.USD")}
                      </option>
                      <option value="JOD">
                        JOD — {t("currencyNames.JOD")}
                      </option>
                      <option value="SAR">
                        SAR — {t("currencyNames.SAR")}
                      </option>
                      <option value="AED">
                        AED — {t("currencyNames.AED")}
                      </option>
                    </select>
                  </label>
                  <label className="a-field">
                    {t("defaultLanguage")}
                    <select
                      value={settings.default_language}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          default_language: e.target.value,
                        })
                      }
                    >
                      <option value="ar">{t("arabic")}</option>
                      <option value="en">{t("english")}</option>
                    </select>
                  </label>
                  <label className="a-field">
                    {t("lowStockThreshold")}
                    <input
                      type="number"
                      min="0"
                      max="1000000"
                      required
                      value={settings.low_stock_threshold}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          low_stock_threshold: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <p className="a-help">{t("currencyHint")}</p>
              </section>
              <section className="a-panel a-settings-panel">
                <h2>{t("contact")}</h2>
                <div className="a-form-grid">
                  <label className="a-field">
                    {t("phone")}
                    <input
                      type="tel"
                      dir="ltr"
                      value={settings.phone || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, phone: e.target.value })
                      }
                    />
                  </label>
                  <label className="a-field">
                    {t("email")}
                    <input
                      type="email"
                      dir="ltr"
                      value={settings.email || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, email: e.target.value })
                      }
                    />
                  </label>
                  <label className="a-field">
                    {t("addressAr")}
                    <textarea
                      dir="rtl"
                      value={settings.address_ar || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, address_ar: e.target.value })
                      }
                    />
                  </label>
                  <label className="a-field">
                    {t("addressEn")}
                    <textarea
                      dir="ltr"
                      value={settings.address_en || ""}
                      onChange={(e) =>
                        setSettings({ ...settings, address_en: e.target.value })
                      }
                    />
                  </label>
                </div>
              </section>
              <section className="a-panel a-settings-panel">
                <h2>{t("deliveryRates")}</h2>
                <p className="a-help">{t("deliveryNote")}</p>
                <div className="a-delivery-grid">
                  {rates.map((rate, index) => (
                    <div className="a-delivery-row" key={rate.governorate}>
                      <label className="a-checkbox">
                        <input
                          type="checkbox"
                          checked={!!rate.enabled}
                          onChange={(e) =>
                            setRates(
                              rates.map((r, i) =>
                                i === index
                                  ? { ...r, enabled: e.target.checked ? 1 : 0 }
                                  : r,
                              ),
                            )
                          }
                        />
                        <span>
                          {t(`governorates.${rate.governorate}`, {
                            defaultValue: rate.governorate,
                          })}
                        </span>
                      </label>
                      <label className="a-rate-input">
                        <span className="a-sr-only">
                          {t("fee")}{" "}
                          {t(`governorates.${rate.governorate}`, {
                            defaultValue: rate.governorate,
                          })}
                        </span>
                        <input
                          type="number"
                          required
                          min="0"
                          max="10000000"
                          value={rate.fee}
                          onChange={(e) =>
                            setRates(
                              rates.map((r, i) =>
                                i === index
                                  ? { ...r, fee: Number(e.target.value) }
                                  : r,
                              ),
                            )
                          }
                        />
                        <span>{settings.currency}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </section>
              <section className="a-panel a-settings-panel">
                <h2>{t("onlinePayments")}</h2>
                <p className="a-help">{t("onlineDisabled")}</p>
                <span className="a-badge">{t("hidden")}</span>
              </section>
              <div className="a-settings-save">
                <button className="a-button" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="a-spin" size={17} />
                  ) : (
                    <Check size={17} />
                  )}{" "}
                  {t("save")}
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
      {categoryDraft && (
        <Modal
          title={t(categoryDraft.id ? "editCategory" : "newCategory")}
          onClose={() => {
            if (!busy) setCategoryDraft(null);
          }}
        >
          <form onSubmit={submitCategory}>
            <div className="a-modal-body">
              <p className="a-help">{t("bilingualHint")}</p>
              <label className="a-field">
                {t("nameAr")} *
                <input
                  autoFocus
                  required
                  maxLength={150}
                  dir="rtl"
                  value={categoryDraft.name_ar}
                  onChange={(e) =>
                    setCategoryDraft({
                      ...categoryDraft,
                      name_ar: e.target.value,
                    })
                  }
                />
              </label>
              <label className="a-field">
                {t("nameEn")} *
                <input
                  required
                  maxLength={150}
                  dir="ltr"
                  value={categoryDraft.name_en}
                  onChange={(e) =>
                    setCategoryDraft({
                      ...categoryDraft,
                      name_en: e.target.value,
                    })
                  }
                />
              </label>
              <ImageField
                value={categoryDraft.image_url}
                onChange={(image_url) =>
                  setCategoryDraft({ ...categoryDraft, image_url })
                }
                onError={fail}
              />
              <label className="a-checkbox">
                <input
                  type="checkbox"
                  checked={!!categoryDraft.visible}
                  onChange={(e) =>
                    setCategoryDraft({
                      ...categoryDraft,
                      visible: e.target.checked ? 1 : 0,
                    })
                  }
                />
                {t("visible")}
              </label>
            </div>
            <div className="a-modal-footer">
              <button
                type="button"
                className="a-button a-button-secondary"
                disabled={busy}
                onClick={() => setCategoryDraft(null)}
              >
                {t("cancel")}
              </button>
              <button className="a-button" disabled={busy}>
                {busy && <LoaderCircle className="a-spin" size={16} />}{" "}
                {t(categoryDraft.id ? "save" : "create")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {productDraft && (
        <Modal
          wide
          title={t(productDraft.id ? "editProduct" : "newProduct")}
          onClose={() => {
            if (!busy) setProductDraft(null);
          }}
        >
          <form onSubmit={submitProduct}>
            <div className="a-modal-body">
              <p className="a-help">{t("bilingualHint")}</p>
              <div className="a-form-grid">
                <label className="a-field">
                  {t("nameAr")} *
                  <input
                    required
                    autoFocus
                    maxLength={160}
                    dir="rtl"
                    value={productDraft.name_ar}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        name_ar: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="a-field">
                  {t("nameEn")} *
                  <input
                    required
                    maxLength={160}
                    dir="ltr"
                    value={productDraft.name_en}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        name_en: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="a-field">
                  {t("descriptionAr")}
                  <textarea
                    rows={3}
                    maxLength={10000}
                    dir="rtl"
                    value={productDraft.description_ar || ""}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        description_ar: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="a-field">
                  {t("descriptionEn")}
                  <textarea
                    rows={3}
                    maxLength={10000}
                    dir="ltr"
                    value={productDraft.description_en || ""}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        description_en: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="a-field">
                  {t("category")} *
                  <select
                    required
                    value={productDraft.category_id}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        category_id: Number(e.target.value),
                      })
                    }
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {localName(c, lang)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="a-field">
                  {t("price")} ({currency}) *
                  <input
                    type="number"
                    min="0"
                    max="100000000"
                    step="1"
                    required
                    value={productDraft.price}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        price: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="a-field">
                  {t("stock")} *
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    step="1"
                    required
                    value={productDraft.stock}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        stock: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="a-checkbox a-align-bottom">
                  <input
                    type="checkbox"
                    checked={!!productDraft.visible}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        visible: e.target.checked ? 1 : 0,
                      })
                    }
                  />
                  {t("visible")}
                </label>
              </div>
              <ImageField
                value={productDraft.image_url || ""}
                onChange={(image_url) =>
                  setProductDraft({ ...productDraft, image_url })
                }
                onError={fail}
              />
              <h3 className="a-form-section-title">{t("bookletFields")}</h3>
              <div className="a-form-grid">
                <label className="a-field">
                  {t("subject")}
                  <input
                    maxLength={150}
                    value={productDraft.subject || ""}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        subject: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="a-field">
                  {t("academicLevel")}
                  <input
                    maxLength={150}
                    value={productDraft.academic_level || ""}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        academic_level: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="a-field">
                  {t("teacherName")}
                  <input
                    maxLength={150}
                    value={productDraft.teacher_name || ""}
                    onChange={(e) =>
                      setProductDraft({
                        ...productDraft,
                        teacher_name: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </div>
            <div className="a-modal-footer">
              <button
                type="button"
                className="a-button a-button-secondary"
                disabled={busy}
                onClick={() => setProductDraft(null)}
              >
                {t("cancel")}
              </button>
              <button className="a-button" disabled={busy}>
                {busy && <LoaderCircle className="a-spin" size={16} />}{" "}
                {t(productDraft.id ? "save" : "create")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title={t(
            deleting.type === "categories" ? "deleteCategory" : "delete",
          )}
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void execute(async () => {
                await api(
                  `/api/admin/${deleting.type}/${deleting.id}`,
                  json("DELETE", moveTo ? { move_to_id: Number(moveTo) } : {}),
                );
                setDeleting(null);
              }, "deleted");
            }}
          >
            <div className="a-modal-body">
              <p>{t("deleteConfirm")}</p>
              {deleting.type === "products" && (
                <p className="a-help">{t("deleteProductHint")}</p>
              )}
              {deleting.type === "categories" &&
                products.some((p) => p.category_id === deleting.id) && (
                  <>
                    <p className="a-help">{t("deleteCategoryHint")}</p>
                    <label className="a-field">
                      {t("moveProductsTo")} *
                      <select
                        required
                        value={moveTo}
                        onChange={(e) => setMoveTo(e.target.value)}
                      >
                        <option value="">{t("selectCategory")}</option>
                        {categories
                          .filter((c) => c.id !== deleting.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {localName(c, lang)}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                )}
            </div>
            <div className="a-modal-footer">
              <button
                type="button"
                className="a-button a-button-secondary"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                {t("cancel")}
              </button>
              <button
                className="a-button a-button-danger"
                disabled={
                  busy ||
                  (deleting.type === "categories" &&
                    products.some((p) => p.category_id === deleting.id) &&
                    !moveTo)
                }
              >
                {t("confirmDelete")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {orderDetail && (
        <Modal
          wide
          title={`${t("orderDetails")} · ${orderDetail.order.order_number}`}
          onClose={() => {
            if (!busy) setOrderDetail(null);
          }}
        >
          <div className="a-modal-body">
            <div className="a-order-customer">
              <div>
                <h3>{t("customer")}</h3>
                <strong>{orderDetail.order.customer_name}</strong>
                <a href={`tel:${orderDetail.order.phone}`} dir="ltr">
                  {orderDetail.order.phone}
                </a>
              </div>
              <div>
                <h3>{t("deliveryAddress")}</h3>
                <p>
                  {t(`governorates.${orderDetail.order.governorate}`, {
                    defaultValue: orderDetail.order.governorate,
                  })}{" "}
                  · {orderDetail.order.area}
                </p>
                <p>{orderDetail.order.address}</p>
              </div>
            </div>
            {orderDetail.order.notes && (
              <div className="a-order-notes">
                <strong>{t("notes")}</strong>
                <p>{orderDetail.order.notes}</p>
              </div>
            )}
            <div className="a-table-wrap">
              <table className="a-table a-detail-table">
                <thead>
                  <tr>
                    <th>{t("product")}</th>
                    <th>{t("quantity")}</th>
                    <th>{t("price")}</th>
                    <th>{t("total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orderDetail.items.map((item, index) => (
                    <tr key={index}>
                      <td>{localName(item, lang)}</td>
                      <td>
                        {new Intl.NumberFormat(lang).format(item.quantity)}
                      </td>
                      <td>{orderMoney(item.price, orderDetail.order)}</td>
                      <td>
                        {orderMoney(
                          item.price * item.quantity,
                          orderDetail.order,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="a-order-totals">
              <div>
                <span>{t("subtotal")}</span>
                <strong>
                  {orderMoney(orderDetail.order.subtotal, orderDetail.order)}
                </strong>
              </div>
              <div>
                <span>{t("delivery")}</span>
                <strong>
                  {orderMoney(
                    orderDetail.order.delivery_fee,
                    orderDetail.order,
                  )}
                </strong>
              </div>
              <div>
                <span>{t("total")}</span>
                <strong>
                  {orderMoney(orderDetail.order.total, orderDetail.order)}
                </strong>
              </div>
            </div>
            <p className="a-help">
              {t("paymentMethod")}: {t("cod")}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void execute(async () => {
                  await api(
                    `/api/admin/orders/${orderDetail.order.id}`,
                    json("PATCH", {
                      status: orderStatus,
                      payment_status: paymentStatus,
                    }),
                  );
                  const detail = await api<{
                    order: Order;
                    items: OrderItem[];
                  }>(`/api/admin/orders/${orderDetail.order.id}`);
                  setOrderDetail(detail);
                });
              }}
            >
              <div className="a-form-grid">
                <label className="a-field">
                  {t("orderStatus")}
                  <select
                    value={orderStatus}
                    disabled={orderDetail.order.status === "cancelled"}
                    onChange={(e) => setOrderStatus(e.target.value)}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {t(`status.${s}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="a-field">
                  {t("paymentStatus")}
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                  >
                    <option value="unpaid">{t("payment.unpaid")}</option>
                    <option value="paid">{t("payment.paid")}</option>
                  </select>
                </label>
              </div>
              <p className="a-help">{t("orderUpdateHint")}</p>
              <button className="a-button" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="a-spin" size={16} />
                ) : (
                  <Check size={16} />
                )}{" "}
                {t("save")}
              </button>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
