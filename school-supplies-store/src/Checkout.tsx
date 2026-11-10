import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { SessionGate, post } from "./Account";
import { money, localName } from "./lib";
import type { StoreData, CartItem } from "./types";
type Props = {
  data: StoreData;
  cart: CartItem[];
  clearCart: () => void;
  refresh: () => Promise<void>;
};
export default function Checkout(p: Props) {
  return <SessionGate>{() => <Delivery {...p} />}</SessionGate>;
}
function Delivery({ data, cart, clearCart, refresh }: Props) {
  const { t, i18n } = useTranslation(),
    ar = i18n.language === "ar",
    s = (a: string, b: string) => (ar ? a : b);
  const [form, setForm] = useState({
      customer_name: "",
      phone: "",
      governorate: "",
      area: "",
      address: "",
      notes: "",
    }),
    [quote, setQuote] = useState<any>(null),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function review(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const q = await post("/api/checkout/quote", {
        items: cart,
        governorate: form.governorate,
      });
      setKey(crypto.randomUUID());
      setQuote(q);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await post("/api/orders", {
        idempotency_key: key,
        quote_id: quote.id,
        shipping: form,
      });
      clearCart();
      await refresh();
      history.pushState({}, "", "/order/" + r.order.id);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!cart.length)
    return (
      <div className="shell page">
        <h1>{s("السلة فارغة", "Your bag is empty")}</h1>
        <a href="/shop">{s("تصفح المنتجات", "Browse products")}</a>
      </div>
    );
  return (
    <div className="shell page checkout-page">
      <div className="demo-label">
        {s(
          "طلب تجريبي فقط — استخدم اسماً ورقماً وعنواناً خيالياً. لا توجد مدفوعات أو شحنات فعلية.",
          "Demo order only — use a fictional name, phone, and address. No real payment or shipment.",
        )}
      </div>
      <h1>
        {quote
          ? s("راجع طلبك قبل التأكيد", "Review before confirming")
          : s("تفاصيل التوصيل التجريبية", "Demo delivery details")}
      </h1>
      {error && (
        <p role="alert" className="error-box">
          {t(`errors.${error}`, { defaultValue: error })}
        </p>
      )}
      <div className="checkout-grid">
        <div>
          {!quote ? (
            <form className="form-panel" onSubmit={review}>
              <div className="form-grid">
                {(
                  [
                    "customer_name",
                    "phone",
                    "area",
                    "address",
                    "notes",
                  ] as const
                ).map((k) => (
                  <label
                    key={k}
                    className={
                      k === "address" || k === "notes" ? "full-width" : ""
                    }
                  >
                    {t(k)}
                    <input
                      required={k !== "notes"}
                      name={k}
                      type={k === "phone" ? "tel" : "text"}
                      dir={k === "phone" ? "ltr" : undefined}
                      maxLength={
                        k === "address"
                          ? 1000
                          : k === "phone"
                            ? 40
                            : k === "notes"
                              ? 2000
                              : 160
                      }
                      pattern={k === "phone" ? "[+0-9 ()\\-]{7,40}" : undefined}
                      value={form[k]}
                      onChange={(e) =>
                        setForm({ ...form, [k]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <label>
                  {s("منطقة التوصيل", "Delivery zone")}
                  <select
                    required
                    name="governorate"
                    value={form.governorate}
                    onChange={(e) =>
                      setForm({ ...form, governorate: e.target.value })
                    }
                  >
                    <option value="">{t("selectGovernorate")}</option>
                    {data.deliveryRates
                      .filter((r) => r.enabled)
                      .map((r) => (
                        <option key={r.governorate} value={r.governorate}>
                          {t("governorates." + r.governorate, {
                            defaultValue: r.governorate,
                          })}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <button className="btn" disabled={busy}>
                {busy
                  ? s("جار الحساب…", "Calculating…")
                  : s("مراجعة السعر والتوصيل", "Review price & delivery")}
              </button>
            </form>
          ) : (
            <section className="form-panel">
              <h2>{s("عنوان التوصيل", "Delivery address")}</h2>
              <p>{form.customer_name}</p>
              <p dir="ltr">{form.phone}</p>
              <p>
                {t("governorates." + form.governorate, {
                  defaultValue: form.governorate,
                })}{" "}
                · {form.area} · {form.address}
              </p>
              <p>{form.notes}</p>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setQuote(null)}
              >
                {s(
                  "تعديل التفاصيل أو تحديث السعر",
                  "Edit details or refresh quote",
                )}
              </button>
              <p>
                {s(
                  "السعر صالح لمدة ١٠ دقائق. إذا تغير السعر أو المخزون ستحتاج إلى المراجعة مجدداً.",
                  "Quote valid for 10 minutes. A price or stock change requires a new review.",
                )}
              </p>
            </section>
          )}
        </div>
        <aside className="summary-card">
          <h2>{t("orderSummary")}</h2>
          {quote ? (
            <>
              <div className="review-quote">
                {s(
                  "الأسعار والرسوم محسوبة من الخادم",
                  "Prices and fees calculated by the server",
                )}
              </div>
              {quote.items.map((x: any) => (
                <div className="summary-item" key={x.product_id}>
                  <span>
                    {localName(x, i18n.language)} × {x.quantity}
                  </span>
                  <strong>
                    {money(x.price * x.quantity, "IQD", i18n.language)}
                  </strong>
                </div>
              ))}
              <div>
                <span>{t("subtotal")}</span>
                <strong>{money(quote.subtotal, "IQD", i18n.language)}</strong>
              </div>
              <div>
                <span>{t("deliveryFee")}</span>
                <strong>
                  {money(quote.delivery_fee, "IQD", i18n.language)}
                </strong>
              </div>
              <div className="summary-total">
                <span>{t("total")}</span>
                <strong>{money(quote.total, "IQD", i18n.language)}</strong>
              </div>
              <button
                className="btn"
                onClick={() => void confirm()}
                disabled={busy}
              >
                {busy
                  ? s("جار التأكيد…", "Confirming…")
                  : s("تأكيد الطلب التجريبي", "Confirm demo order")}
              </button>
            </>
          ) : (
            <p>
              {s(
                "أكمل تفاصيل التوصيل لعرض المجموع المؤكد من الخادم.",
                "Complete delivery details to see your server-confirmed total.",
              )}
            </p>
          )}
          <p className="summary-note">
            {s(
              "الدفع الفعلي والإطلاق العام بانتظار موافقة صاحب المتجر.",
              "Live payments and public launch await the store owner’s approval.",
            )}
          </p>
        </aside>
      </div>
    </div>
  );
}
