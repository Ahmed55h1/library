import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  Search,
  Globe,
  Plus,
  Minus,
  X,
  Check,
  Truck,
  BookOpen,
  Sparkles,
  ShieldCheck,
  Package,
  CheckCircle2,
  ChevronDown,
  MapPin,
  Phone,
  Mail,
  Leaf,
  LoaderCircle,
} from "lucide-react";
import { api, money, localName, description } from "./lib";
import i18nInstance, { hasLanguagePreference } from "./i18n";
import type { StoreData, Product, CartItem, Order, OrderItem } from "./types";
import Admin from "./Admin";
import Art from "./Art";

function useRoute() {
  const [path, setPath] = useState(location.pathname + location.search);
  useEffect(() => {
    const fn = () => {
      setPath(location.pathname + location.search);
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", fn);
    return () => window.removeEventListener("popstate", fn);
  }, []);
  return path;
}
function go(href: string) {
  history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
function Link({
  href,
  children,
  className = "",
  ...props
}: {
  href: string;
  children: ReactNode;
  className?: string;
  [key: string]: any;
}) {
  return (
    <a
      href={href}
      className={className}
      {...props}
      onClick={(e) => {
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault();
          go(href);
        }
      }}
    >
      {children}
    </a>
  );
}
function readCart(): CartItem[] {
  try {
    const value = JSON.parse(localStorage.getItem("maktabati-cart") || "[]");
    return Array.isArray(value)
      ? value
          .filter(
            (v) =>
              Number.isInteger(v.product_id) &&
              Number.isInteger(v.quantity) &&
              v.quantity > 0,
          )
          .slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
type Confirmation = {
  order: Order & { currency?: string };
  items: OrderItem[];
};

export default function App() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const path = useRoute();
  const [data, setData] = useState<StoreData | null>(null),
    [loadError, setLoadError] = useState("");
  const [cart, setCart] = useState<CartItem[]>(readCart),
    [toast, setToast] = useState("");
  const reload = useCallback(async () => {
    try {
      const d = await api<StoreData>("/api/store");
      setData(d);
      setLoadError("");
      if (
        !hasLanguagePreference &&
        !localStorage.getItem("maktabati-default-applied")
      ) {
        i18nInstance.changeLanguage(
          d.settings.default_language === "en" ? "en" : "ar",
        );
        localStorage.setItem("maktabati-default-applied", "1");
      }
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    try {
      localStorage.setItem("maktabati-cart", JSON.stringify(cart));
    } catch {}
  }, [cart]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  useEffect(() => {
    document.title = data
      ? `${localName(data.settings, lang)} | ${t("tagline")}`
      : "مكتبتي | Maktabati";
  }, [data, lang, t]);
  const err = (code: string) =>
    t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") });
  function add(product: Product, quantity = 1) {
    const current =
      cart.find((c) => c.product_id === product.id)?.quantity || 0;
    if (current + quantity > product.stock) {
      setToast(t("stockLimit"));
      return;
    }
    setCart((c) =>
      current
        ? c.map((x) =>
            x.product_id === product.id
              ? { ...x, quantity: x.quantity + quantity }
              : x,
          )
        : [...c, { product_id: product.id, quantity }],
    );
    setToast(t("added"));
  }
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;
  const bookletCategory =
    data?.categories.find((category) =>
      /booklet|ملازم/i.test(`${category.name_ar} ${category.name_en}`),
    ) ||
    data?.categories.find((category) =>
      data.products.some(
        (product) => product.category_id === category.id && product.subject,
      ),
    );
  if (path.startsWith("/admin"))
    return <Admin storeSettings={data?.settings} />;
  const count = cart.reduce((n, c) => n + c.quantity, 0),
    currentPath = path.split("?")[0];
  return (
    <>
      <a href="#content" className="skip-link">
        {t("skip")}
      </a>
      <div className="announcement">
        <span>{t("announcement")}</span>
        <span className="announcement-end">
          <Truck size={14} />
          {t("codBadge")}
        </span>
      </div>
      <header className="site-header">
        <div className="shell header-main">
          <Link href="/" className="brand">
            {data?.settings.logo_url ? (
              <img src={data.settings.logo_url} alt="" />
            ) : (
              <span className="brand-icon">
                <BookOpen size={25} />
                <span />
              </span>
            )}
            <span>
              {data ? localName(data.settings, lang) : t("brand")}
              <small>{data?.settings.name_en || "Maktabati"}</small>
            </span>
          </Link>
          <nav className="desktop-nav">
            <Link href="/" className={currentPath === "/" ? "active" : ""}>
              {t("home")}
            </Link>
            {data?.categories.map((c) => (
              <Link
                key={c.id}
                href={`/category/${c.id}`}
                className={currentPath === `/category/${c.id}` ? "active" : ""}
              >
                {localName(c, lang)}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <button
              className="language"
              onClick={() => i18n.changeLanguage(lang === "ar" ? "en" : "ar")}
            >
              <Globe size={17} />
              {t("language")}
            </button>
            <Link
              href="/cart"
              className="bag-button"
              aria-label={`${t("cart")} (${count})`}
            >
              <ShoppingBag size={21} />
              <span className="cart-count">
                {new Intl.NumberFormat(lang).format(count)}
              </span>
            </Link>
          </div>
        </div>
        <div className="shell mobile-nav">
          <Link href="/shop">{t("allProducts")}</Link>
          {data?.categories.map((c) => (
            <Link key={c.id} href={`/category/${c.id}`}>
              {localName(c, lang)}
            </Link>
          ))}
        </div>
      </header>
      <main id="content">
        {!data ? (
          <div className="shell loading-state">
            {loadError ? (
              <>
                <Package size={44} />
                <h2>{t("errorTitle")}</h2>
                <p>{err(loadError)}</p>
                <button className="btn" onClick={reload}>
                  {t("retry")}
                </button>
              </>
            ) : (
              <>
                <LoaderCircle className="spin" />
                {t("loading")}
              </>
            )}
          </div>
        ) : currentPath === "/" ? (
          <>
            <section className="hero">
              <div className="shell hero-inner">
                <div className="hero-copy">
                  <span className="eyebrow">
                    <span className="small-star">✳</span>
                    {t("heroEyebrow")}
                  </span>
                  <h1>
                    {t("heroTitle")
                      .split("\n")
                      .map((s, i) => (
                        <span key={i}>{s}</span>
                      ))}
                  </h1>
                  <p>{t("heroText")}</p>
                  <div className="hero-buttons">
                    <Link href="/shop" className="btn">
                      {t("explore")}
                      <Arrow size={18} />
                    </Link>
                    <Link
                      href={
                        bookletCategory
                          ? `/category/${bookletCategory.id}`
                          : "/shop"
                      }
                      className="text-link"
                    >
                      {t(bookletCategory ? "browseBooklets" : "explore")}
                      <ArrowUpRight size={17} />
                    </Link>
                  </div>
                  <div className="hero-foot">
                    <span className="hero-mini-icon">
                      <Leaf size={15} />
                    </span>
                    {t("curated")}
                    <span className="dot" />
                    {t("physical")}
                  </div>
                </div>
                <div className="hero-visual">
                  <span className="handwritten hero-caption">
                    {t("heroNote")}
                  </span>
                  <Art />
                  <div className="paper-label">
                    <Sparkles size={18} />
                    <span>{t("tagline")}</span>
                  </div>
                </div>
              </div>
            </section>
            <section className="shell categories-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{t("sectionEyebrow")}</p>
                  <h2>{t("categoryTitle")}</h2>
                </div>
                <span className="section-doodle">✳</span>
              </div>
              <div className="category-grid">
                {data.categories.map((c, i) => (
                  <Link
                    key={c.id}
                    href={`/category/${c.id}`}
                    className={`category-card category-${i % 3}`}
                  >
                    <div>
                      <span className="category-number">
                        0{new Intl.NumberFormat(lang).format(i + 1)}
                      </span>
                      <h3>{localName(c, lang)}</h3>
                      <p>
                        {t(
                          c.id === bookletCategory?.id
                            ? "bookletsText"
                            : /stationery|قرطاس/i.test(
                                  `${c.name_ar} ${c.name_en}`,
                                )
                              ? "stationeryText"
                              : "collectionText",
                        )}
                      </p>
                      <span className="category-link">
                        {t("browse")}
                        <Arrow size={17} />
                      </span>
                    </div>
                    <img src={c.image_url || "/samples/notebook.svg"} alt="" />
                    <span className="category-arrow">
                      <ArrowUpRight size={22} />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
            <section className="shell featured-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{t("featuredEyebrow")}</p>
                  <h2>{t("featuredTitle")}</h2>
                  <p className="section-description">{t("featuredText")}</p>
                </div>
                <Link href="/shop" className="text-link">
                  {t("viewAll")}
                  <Arrow size={16} />
                </Link>
              </div>
              <div className="product-grid">
                {data.products.slice(0, 8).map((p) => (
                  <ProductCard key={p.id} p={p} data={data} add={add} />
                ))}
              </div>
              {!data.products.length && (
                <p className="empty">{t("noProducts")}</p>
              )}
            </section>
            {bookletCategory && (
              <section className="shell">
                <div className="study-banner">
                  <div>
                    <p className="eyebrow">{t("bannerEyebrow")}</p>
                    <h2>
                      {t("bannerTitle")
                        .split("\n")
                        .map((s, i) => (
                          <span key={i}>{s}</span>
                        ))}
                    </h2>
                    <p>{t("bannerText")}</p>
                    <Link
                      href={`/category/${bookletCategory.id}`}
                      className="btn btn-light"
                    >
                      {t("browseBooklets")}
                      <Arrow size={18} />
                    </Link>
                  </div>
                  <div className="banner-art">
                    <img src="/samples/math.svg" alt="" />
                    <img src="/samples/physics.svg" alt="" />
                    <span>✳</span>
                  </div>
                </div>
              </section>
            )}
            <section className="shell benefits">
              {[
                [Sparkles, "benefit1"],
                [BookOpen, "benefit2"],
                [ShieldCheck, "benefit3"],
              ].map(([Icon, key]) => {
                const I = Icon as typeof Sparkles;
                return (
                  <div key={String(key)}>
                    <span>
                      <I size={24} />
                    </span>
                    <div>
                      <h3>{t(String(key))}</h3>
                      <p>{t(String(key) + "Text")}</p>
                    </div>
                  </div>
                );
              })}
            </section>
          </>
        ) : currentPath === "/shop" || currentPath.startsWith("/category/") ? (
          <Catalog key={currentPath} data={data} path={path} add={add} />
        ) : currentPath.startsWith("/product/") ? (
          <ProductDetail
            data={data}
            id={Number(currentPath.split("/")[2])}
            add={add}
          />
        ) : currentPath === "/cart" ? (
          <Cart data={data} cart={cart} setCart={setCart} />
        ) : currentPath === "/checkout" ? (
          <Checkout
            data={data}
            cart={cart}
            clearCart={() => setCart([])}
            refresh={reload}
          />
        ) : currentPath.startsWith("/order/") ? (
          <OrderConfirmation
            id={currentPath.split("/")[2]}
            token={new URLSearchParams(path.split("?")[1]).get("token") || ""}
            data={data}
          />
        ) : (
          <div className="empty">
            <h1>{t("notFound")}</h1>
            <Link className="btn" href="/">
              {t("backHome")}
            </Link>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <div className="shell footer-grid">
          <div>
            <Link className="brand footer-brand" href="/">
              <BookOpen size={27} />
              {data ? localName(data.settings, lang) : t("brand")}
            </Link>
            <h3>{t("footerTitle")}</h3>
            <p>{t("footerText")}</p>
          </div>
          <div>
            <h4>{t("quickLinks")}</h4>
            <Link href="/shop">{t("allProducts")}</Link>
            {data?.categories.map((c) => (
              <Link href={`/category/${c.id}`} key={c.id}>
                {localName(c, lang)}
              </Link>
            ))}
            <Link href="/admin">{t("admin")}</Link>
          </div>
          <div>
            <h4>{t("contact")}</h4>
            {data?.settings.phone && (
              <a href={`tel:${data.settings.phone}`}>
                <Phone size={15} />
                <bdi>{data.settings.phone}</bdi>
              </a>
            )}
            {data?.settings.email && (
              <a href={`mailto:${data.settings.email}`}>
                <Mail size={15} />
                {data.settings.email}
              </a>
            )}
            {(data?.settings.address_ar || data?.settings.address_en) && (
              <p>
                <MapPin size={15} />
                {lang === "ar"
                  ? data.settings.address_ar || data.settings.address_en
                  : data.settings.address_en || data.settings.address_ar}
              </p>
            )}
            <span className="footer-cod">
              <Truck size={17} />
              {t("codBadge")}
            </span>
          </div>
        </div>
        <div className="shell footer-bottom">
          <span>
            ©{" "}
            {new Intl.NumberFormat(lang, { useGrouping: false }).format(
              new Date().getFullYear(),
            )}{" "}
            {data ? localName(data.settings, lang) : t("brand")}
          </span>
          <span>
            {t("footerNote")} <span>✳</span>
          </span>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button onClick={() => setToast("")} aria-label={t("close")}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

function ProductCard({
  p,
  data,
  add,
}: {
  p: Product;
  data: StoreData;
  add: (p: Product, q?: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const l = i18n.language;
  const cat = data.categories.find((c) => c.id === p.category_id);
  return (
    <article className="product-card">
      <div className={`product-picture tone-${p.id % 4}`}>
        <Link href={`/product/${p.id}`} tabIndex={-1}>
          <img
            loading="lazy"
            src={p.image_url || "/samples/notebook.svg"}
            alt={localName(p, l)}
          />
        </Link>
        {!p.stock ? (
          <span className="product-badge sold-out">{t("outOfStock")}</span>
        ) : p.id % 4 === 0 ? (
          <span className="product-badge">
            {p.subject ? t("study") : t("new")}
          </span>
        ) : null}
        <button
          onClick={() => add(p)}
          disabled={!p.stock}
          className="quick-add"
          aria-label={`${t("addToCart")}: ${localName(p, l)}`}
        >
          <Plus size={20} />
        </button>
      </div>
      <span className="product-category">{cat && localName(cat, l)}</span>
      <Link href={`/product/${p.id}`} className="product-name">
        {localName(p, l)}
      </Link>
      <div className="product-meta">
        <strong>{money(p.price, data.settings.currency, l)}</strong>
        {p.stock > 0 && p.stock <= 5 && (
          <small>{t("leftInStock", { count: p.stock })}</small>
        )}
      </div>
    </article>
  );
}

function Catalog({
  data,
  path,
  add,
}: {
  data: StoreData;
  path: string;
  add: (p: Product, q?: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const l = i18n.language;
  const id = path.startsWith("/category/")
      ? Number(path.split("/")[2].split("?")[0])
      : 0,
    category = data.categories.find((c) => c.id === id);
  const [search, setSearch] = useState(
      new URLSearchParams(path.split("?")[1]).get("q") || "",
    ),
    [sort, setSort] = useState("recommended"),
    [available, setAvailable] = useState(false),
    [filter, setFilter] = useState(id);
  const products = useMemo(
    () =>
      data.products
        .filter(
          (p) =>
            (!filter || p.category_id === filter) &&
            (!available || p.stock > 0) &&
            [
              p.name_ar,
              p.name_en,
              p.description_ar,
              p.description_en,
              p.subject,
              p.teacher_name,
              p.academic_level,
            ]
              .join(" ")
              .toLocaleLowerCase()
              .includes(search.trim().toLocaleLowerCase()),
        )
        .sort((a, b) =>
          sort === "priceAsc"
            ? a.price - b.price
            : sort === "priceDesc"
              ? b.price - a.price
              : sort === "newest"
                ? b.created_at.localeCompare(a.created_at) || b.id - a.id
                : 0,
        ),
    [data, search, filter, sort, available],
  );
  return (
    <div className="shell page catalog">
      <div className="breadcrumb">
        <Link href="/">{t("home")}</Link>
        <span>/</span>
        {category ? localName(category, l) : t("allProducts")}
      </div>
      <div className="catalog-heading">
        <div>
          <p className="eyebrow">{t("featuredEyebrow")}</p>
          <h1>{category ? localName(category, l) : t("allProducts")}</h1>
        </div>
        <p>{t("results", { count: products.length })}</p>
      </div>
      <div className="search-box">
        <Search size={20} />
        <input
          type="search"
          placeholder={t("search")}
          aria-label={t("searchLabel")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch("")} aria-label={t("reset")}>
            <X size={18} />
          </button>
        )}
      </div>
      <div className="catalog-tools">
        <div className="filter-tabs">
          <button
            className={!filter ? "selected" : ""}
            onClick={() => go("/shop")}
          >
            {t("allProducts")}
          </button>
          {data.categories.map((c) => (
            <button
              className={filter === c.id ? "selected" : ""}
              key={c.id}
              onClick={() => go(`/category/${c.id}`)}
            >
              {localName(c, l)}
            </button>
          ))}
        </div>
        <div className="sort-tools">
          <label className="check-label">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
            />
            {t("availability")}
          </label>
          <label className="sort-label">
            <span>{t("sort")}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {["recommended", "priceAsc", "priceDesc", "newest"].map((s) => (
                <option value={s} key={s}>
                  {t(s)}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
        </div>
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard p={p} data={data} add={add} key={p.id} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Search size={38} />
          <h2>{t("noProducts")}</h2>
          <p>{t("trySearch")}</p>
          <button
            className="btn"
            onClick={() => {
              setSearch("");
              setFilter(0);
              setAvailable(false);
              go("/shop");
            }}
          >
            {t("reset")}
          </button>
        </div>
      )}
    </div>
  );
}

function Quantity({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="quantity">
      <button
        type="button"
        aria-label={t("decrease")}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={14} />
      </button>
      <span>{new Intl.NumberFormat(i18n.language).format(value)}</span>
      <button
        type="button"
        aria-label={t("increase")}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
function ProductDetail({
  data,
  id,
  add,
}: {
  data: StoreData;
  id: number;
  add: (p: Product, q?: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const l = i18n.language,
    [q, setQ] = useState(1);
  const p = data.products.find((x) => x.id === id);
  if (!p)
    return (
      <div className="empty">
        <Package size={45} />
        <h1>{t("unavailable")}</h1>
        <Link href="/shop" className="btn">
          {t("continueShopping")}
        </Link>
      </div>
    );
  const c = data.categories.find((c) => c.id === p.category_id);
  return (
    <div className="shell page">
      <div className="breadcrumb">
        <Link href="/">{t("home")}</Link>
        <span>/</span>
        <Link href={`/category/${c?.id}`}>{c && localName(c, l)}</Link>
        <span>/</span>
        {localName(p, l)}
      </div>
      <div className="detail-grid">
        <div className={`detail-picture tone-${p.id % 4}`}>
          <img
            src={p.image_url || "/samples/notebook.svg"}
            alt={localName(p, l)}
          />
        </div>
        <div className="detail-copy">
          <p className="eyebrow">{c && localName(c, l)}</p>
          <h1>{localName(p, l)}</h1>
          <div className="detail-price">
            {money(p.price, data.settings.currency, l)}
          </div>
          <p className={`stock-label ${p.stock ? "" : "out"}`}>
            <span />
            {p.stock ? t("leftInStock", { count: p.stock }) : t("outOfStock")}
          </p>
          <p className="detail-description">{description(p, l)}</p>
          {(["subject", "academic_level", "teacher_name"] as const)
            .filter((k) => p[k])
            .map((k) => (
              <div className="detail-spec" key={k}>
                <span>{t(k)}</span>
                <strong>{p[k]}</strong>
              </div>
            ))}
          <div className="detail-buy">
            <Quantity value={q} max={p.stock} onChange={setQ} />
            <button
              className="btn"
              disabled={!p.stock}
              onClick={() => add(p, q)}
            >
              <ShoppingBag size={18} />
              {p.stock ? t("addToCart") : t("outOfStock")}
            </button>
          </div>
          <div className="detail-assurance">
            <Truck size={17} />
            {t("delivery")}
            <span>·</span>
            <ShieldCheck size={17} />
            {t("codBadge")}
          </div>
        </div>
      </div>
    </div>
  );
}

function Cart({
  data,
  cart,
  setCart,
}: {
  data: StoreData;
  cart: CartItem[];
  setCart: (c: CartItem[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const l = i18n.language;
  const rows = cart.map((c) => ({
    item: c,
    product: data.products.find((p) => p.id === c.product_id),
  }));
  const subtotal = rows.reduce(
      (n, r) => n + (r.product?.price || 0) * r.item.quantity,
      0,
    ),
    invalid = rows.some((r) => !r.product || r.item.quantity > r.product.stock);
  if (!cart.length)
    return (
      <div className="shell empty cart-empty">
        <span className="empty-icon">
          <ShoppingBag size={42} />
        </span>
        <h1>{t("cartEmpty")}</h1>
        <p>{t("cartEmptyText")}</p>
        <Link href="/shop" className="btn">
          {t("explore")}
          <ArrowUpRight size={18} />
        </Link>
      </div>
    );
  return (
    <div className="shell page">
      <div className="breadcrumb">
        <Link href="/">{t("home")}</Link>
        <span>/</span>
        {t("cart")}
      </div>
      <h1 className="page-title">
        {t("cart")}{" "}
        <small>
          (
          {new Intl.NumberFormat(l).format(
            cart.reduce((n, c) => n + c.quantity, 0),
          )}
          )
        </small>
      </h1>
      <div className="checkout-grid">
        <div className="cart-items">
          {rows.map(({ item, product: p }) => (
            <div className="cart-row" key={item.product_id}>
              <div className="cart-image">
                <img src={p?.image_url || "/samples/notebook.svg"} alt="" />
              </div>
              <div className="cart-row-info">
                <Link href={`/product/${item.product_id}`}>
                  <h3>{p ? localName(p, l) : t("unavailable")}</h3>
                </Link>
                <p>
                  {p
                    ? money(p.price, data.settings.currency, l)
                    : t("unavailable")}
                </p>
                {p && (
                  <Quantity
                    value={item.quantity}
                    max={p.stock}
                    onChange={(quantity) =>
                      setCart(
                        cart.map((c) =>
                          c.product_id === p.id ? { ...c, quantity } : c,
                        ),
                      )
                    }
                  />
                )}
                <button
                  className="remove"
                  onClick={() =>
                    setCart(
                      cart.filter((c) => c.product_id !== item.product_id),
                    )
                  }
                >
                  {t("remove")}
                </button>
                {(!p || p.stock < item.quantity) && (
                  <p className="field-error">{t("stockLimit")}</p>
                )}
              </div>
              <strong>
                {money(
                  (p?.price || 0) * item.quantity,
                  data.settings.currency,
                  l,
                )}
              </strong>
            </div>
          ))}
          <Link className="text-link" href="/shop">
            {l === "ar" ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}{" "}
            {t("continueShopping")}
          </Link>
        </div>
        <aside className="summary-card">
          <h2>{t("orderSummary")}</h2>
          <div>
            <span>{t("subtotal")}</span>
            <strong>{money(subtotal, data.settings.currency, l)}</strong>
          </div>
          <div>
            <span>{t("deliveryFee")}</span>
            <small>{t("calculatedAtCheckout")}</small>
          </div>
          <div className="summary-total">
            <span>{t("subtotal")}</span>
            <strong>{money(subtotal, data.settings.currency, l)}</strong>
          </div>
          {invalid ? (
            <p className="error-box">{t("soldOutCart")}</p>
          ) : (
            <Link className="btn" href="/checkout">
              {t("checkout")}
              <ArrowUpRight size={18} />
            </Link>
          )}
          <p className="summary-note">
            <ShieldCheck size={16} />
            {t("cartNote")}
          </p>
        </aside>
      </div>
    </div>
  );
}

function Checkout({
  data,
  cart,
  clearCart,
  refresh,
}: {
  data: StoreData;
  cart: CartItem[];
  clearCart: () => void;
  refresh: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const l = i18n.language;
  const [form, setForm] = useState({
      customer_name: "",
      phone: "",
      governorate: "",
      area: "",
      address: "",
      notes: "",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [key] = useState(() => {
      // This is cart request metadata, so retries after a refresh keep the same key.
      const fingerprint = JSON.stringify(cart);
      try {
        const previous = JSON.parse(
          localStorage.getItem("maktabati-cart-request") || "null",
        );
        if (
          previous?.fingerprint === fingerprint &&
          typeof previous.key === "string"
        )
          return previous.key as string;
        const key = crypto.randomUUID();
        localStorage.setItem(
          "maktabati-cart-request",
          JSON.stringify({ fingerprint, key }),
        );
        return key;
      } catch {
        return crypto.randomUUID();
      }
    });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  function changeField(field: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
    setFieldErrors((previous) => ({ ...previous, [field]: "" }));
    setError("");
  }
  const rows = cart.map((c) => ({
    item: c,
    p: data.products.find((p) => p.id === c.product_id),
  }));
  const subtotal = rows.reduce(
    (n, r) => n + (r.p?.price || 0) * r.item.quantity,
    0,
  );
  const rate = data.deliveryRates.find(
    (r) => r.governorate === form.governorate && r.enabled,
  );
  const total = subtotal + (rate?.fee || 0);
  const invalid = rows.some((r) => !r.p || r.p.stock < r.item.quantity);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errors: Record<string, string> = {};
    for (const k of [
      "customer_name",
      "phone",
      "governorate",
      "area",
      "address",
    ] as const)
      if (!form[k].trim()) errors[k] = "required";
    if (form.phone && !/^[+\d\s()\-]{7,40}$/.test(form.phone))
      errors.phone = "phoneInvalid";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Confirmation & { access_token: string }>(
        "/api/orders",
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            idempotency_key: key,
            items: cart,
            payment_method: "cod",
          }),
        },
      );
      localStorage.removeItem("maktabati-cart-request");
      clearCart();
      await refresh();
      go(
        `/order/${result.order.id}?token=${encodeURIComponent(result.access_token)}`,
      );
    } catch (e) {
      setError((e as Error).message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  if (!cart.length) return <Cart data={data} cart={cart} setCart={() => {}} />;
  function field(k: keyof typeof form, type = "text") {
    return (
      <label
        className={k === "address" || k === "notes" ? "full-width" : ""}
        key={k}
      >
        {t(k)}
        {k === "notes" ? (
          <textarea
            rows={3}
            maxLength={2000}
            value={form[k]}
            onChange={(e) => changeField(k, e.target.value)}
          />
        ) : (
          <input
            type={type}
            autoComplete={
              k === "customer_name"
                ? "name"
                : k === "phone"
                  ? "tel"
                  : k === "address"
                    ? "street-address"
                    : undefined
            }
            maxLength={k === "address" ? 1000 : k === "phone" ? 40 : 160}
            dir={k === "phone" ? "ltr" : undefined}
            value={form[k]}
            onChange={(e) => changeField(k, e.target.value)}
            aria-invalid={!!fieldErrors[k]}
          />
        )}{" "}
        {fieldErrors[k] && (
          <span className="field-error">{t(fieldErrors[k])}</span>
        )}
      </label>
    );
  }
  return (
    <div className="shell page checkout-page">
      <div className="breadcrumb">
        <Link href="/cart">{t("cart")}</Link>
        <span>/</span>
        {t("checkout")}
      </div>
      <h1>{t("checkoutTitle")}</h1>
      <p className="page-description">{t("checkoutText")}</p>
      <form onSubmit={submit} noValidate>
        <div className="checkout-grid">
          <div className="checkout-fields">
            <section className="form-panel">
              <h2>
                <span>01</span>
                {t("contactDetails")}
              </h2>
              <div className="form-grid">
                {field("customer_name")}
                {field("phone", "tel")}
              </div>
            </section>
            <section className="form-panel">
              <h2>
                <span>02</span>
                {t("deliveryAddress")}
              </h2>
              <div className="form-grid">
                <label>
                  {t("governorate")}
                  <select
                    value={form.governorate}
                    onChange={(e) => changeField("governorate", e.target.value)}
                    aria-invalid={!!fieldErrors.governorate}
                  >
                    <option value="">{t("selectGovernorate")}</option>
                    {data.deliveryRates
                      .filter((r) => r.enabled)
                      .map((r) => (
                        <option value={r.governorate} key={r.governorate}>
                          {t(`governorates.${r.governorate}`, {
                            defaultValue: r.governorate,
                          })}
                        </option>
                      ))}
                  </select>
                  {fieldErrors.governorate && (
                    <span className="field-error">{t("required")}</span>
                  )}
                </label>
                {field("area")}
                {field("address")}
                {field("notes")}
              </div>
            </section>
            <section className="form-panel">
              <h2>
                <span>03</span>
                {t("payment")}
              </h2>
              <div className="payment-option">
                <span className="radio-selected" />
                <div>
                  <strong>{t("cod")}</strong>
                  <p>{t("codText")}</p>
                </div>
                <Truck size={24} />
              </div>
              <p className="disabled-payment">
                <ShieldCheck size={15} />
                {t("onlineDisabled")}
              </p>
            </section>
          </div>
          <aside className="summary-card">
            <h2>{t("orderSummary")}</h2>
            {rows.map(({ item, p }) => (
              <div className="summary-item" key={item.product_id}>
                <img src={p?.image_url || "/samples/notebook.svg"} alt="" />
                <span>
                  {p ? localName(p, l) : t("unavailable")}
                  <small>
                    × {new Intl.NumberFormat(l).format(item.quantity)}
                  </small>
                </span>
                <strong>
                  {money(
                    (p?.price || 0) * item.quantity,
                    data.settings.currency,
                    l,
                  )}
                </strong>
              </div>
            ))}
            <div>
              <span>{t("subtotal")}</span>
              <strong>{money(subtotal, data.settings.currency, l)}</strong>
            </div>
            <div>
              <span>{t("deliveryFee")}</span>
              <strong>
                {rate ? money(rate.fee, data.settings.currency, l) : "—"}
              </strong>
            </div>
            <div className="summary-total">
              <span>{t("total")}</span>
              <strong>{money(total, data.settings.currency, l)}</strong>
            </div>
            {error && (
              <p className="error-box" role="alert">
                {t(`errors.${error}`, {
                  defaultValue: t("errors.INTERNAL_ERROR"),
                })}
              </p>
            )}
            {invalid && <p className="error-box">{t("soldOutCart")}</p>}
            <button className="btn" type="submit" disabled={busy || invalid}>
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <Check size={18} />
              )}{" "}
              {t(busy ? "placingOrder" : "placeOrder")}
            </button>
            <p className="summary-note">
              <ShieldCheck size={15} />
              {t("codText")}
            </p>
          </aside>
        </div>
      </form>
    </div>
  );
}

function OrderConfirmation({
  id,
  token,
  data,
}: {
  id: string;
  token: string;
  data: StoreData;
}) {
  const { t, i18n } = useTranslation();
  const l = i18n.language;
  const [result, setResult] = useState<Confirmation | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<Confirmation>(`/api/orders/${id}?token=${encodeURIComponent(token)}`)
      .then(setResult)
      .catch((e) => setError(e.message));
  }, [id, token]);
  if (error)
    return (
      <div className="empty">
        <h1>{t("errorTitle")}</h1>
        <p>
          {t(`errors.${error}`, { defaultValue: t("errors.INTERNAL_ERROR") })}
        </p>
        <Link href="/" className="btn">
          {t("backHome")}
        </Link>
      </div>
    );
  if (!result)
    return (
      <div className="empty">
        <LoaderCircle className="spin" />
        {t("loading")}
      </div>
    );
  const { order: o, items } = result,
    currency = o.currency || data.settings.currency;
  return (
    <div className="shell page confirmation">
      <div className="success-icon">
        <CheckCircle2 size={42} />
      </div>
      <p className="eyebrow">
        {t("orderNumber")} <bdi>{o.order_number}</bdi>
      </p>
      <h1>{t("orderSuccess")}</h1>
      <p>{t("orderSuccessText")}</p>
      <div className="confirmation-card">
        <div className="confirmation-status">
          <div>
            <small>{t("orderStatus")}</small>
            <span className="status-pill">{t(`status.${o.status}`)}</span>
          </div>
          <div>
            <small>{t("paymentStatus")}</small>
            <strong>{t(`status.${o.payment_status}`)}</strong>
          </div>
          <div>
            <small>{t("orderDate")}</small>
            <strong>
              {new Intl.DateTimeFormat(l === "ar" ? "ar-IQ" : "en-GB", {
                dateStyle: "medium",
              }).format(new Date(o.created_at.replace(" ", "T") + "Z"))}
            </strong>
          </div>
        </div>
        {items.map((item, i) => (
          <div className="confirmation-item" key={i}>
            <span>
              {localName(item, l)} ×{" "}
              {new Intl.NumberFormat(l).format(item.quantity)}
            </span>
            <strong>{money(item.price * item.quantity, currency, l)}</strong>
          </div>
        ))}
        <div className="confirmation-item">
          <span>{t("subtotal")}</span>
          <strong>{money(o.subtotal, currency, l)}</strong>
        </div>
        <div className="confirmation-item">
          <span>{t("deliveryFee")}</span>
          <strong>{money(o.delivery_fee, currency, l)}</strong>
        </div>
        <div className="confirmation-item confirmation-total">
          <span>{t("total")}</span>
          <strong>{money(o.total, currency, l)}</strong>
        </div>
        <div className="delivery-summary">
          <MapPin size={21} />
          <div>
            <strong>{t("deliveryTo")}</strong>
            <p>
              {o.customer_name} · <bdi>{o.phone}</bdi>
            </p>
            <p>
              {t(`governorates.${o.governorate}`, {
                defaultValue: o.governorate,
              })}
              ، {o.area}، {o.address}
            </p>
          </div>
        </div>
      </div>
      <Link className="btn" href="/">
        {t("backHome")}
        <ArrowUpRight size={18} />
      </Link>
    </div>
  );
}
