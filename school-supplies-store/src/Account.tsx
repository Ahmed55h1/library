import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, money } from "./lib";
export type User = {
  id: string;
  email: string;
  role: string;
  twoFactorEnabled: number;
  mfa: boolean;
  permissions: string[];
  passwordChangeRequired: number;
};
export const post = (url: string, body: unknown, method = "POST") =>
  api(url, { method, body: JSON.stringify(body) });
export function SessionGate({
  children,
  internal = false,
}: {
  children: (u: User) => React.ReactNode;
  internal?: boolean;
}) {
  const { i18n } = useTranslation(),
    ar = i18n.language === "ar",
    s = (a: string, b: string) => (ar ? a : b);
  const [u, setU] = useState<User | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("login"),
    [challenge, setChallenge] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [backup, setBackup] = useState(false),
    [setup, setSetup] = useState<{
      totpURI: string;
      backupCodes: string[];
    } | null>(null),
    [messages, setMessages] = useState<{ subject: string; url: string }[]>([]),
    [notice, setNotice] = useState("");
  const reload = async () => {
    try {
      setU((await api("/api/me/session")).user);
    } catch {
      setU(null);
    } finally {
      setLoaded(true);
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  useEffect(() => {
    if (internal && u?.twoFactorEnabled && !u.mfa) setChallenge(true);
  }, [u, internal]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (u?.passwordChangeRequired) {
        await post("/api/auth/change-password", {
          currentPassword: password,
          newPassword,
          revokeOtherSessions: true,
        });
        setPassword("");
        setNewPassword("");
        await reload();
        return;
      }
      if (challenge) {
        await post(
          `/api/auth/two-factor/verify-${backup ? "backup-code" : "totp"}`,
          { code, trustDevice: false },
        );
        setChallenge(false);
        setSetup(null);
        await reload();
        return;
      }
      if (u && internal) {
        const result = await post("/api/auth/two-factor/enable", { password });
        setSetup(result);
        setChallenge(true);
        return;
      }
      if (mode === "register") {
        await post("/api/auth/sign-up/email", {
          email,
          password,
          name,
          callbackURL: location.origin + "/account",
        });
        setNotice(
          s("تحقق من بريدك ثم سجل الدخول.", "Verify your email, then sign in."),
        );
        setMode("login");
      } else if (mode === "recovery") {
        await post("/api/auth/request-password-reset", {
          email,
          redirectTo: location.origin + "/account?reset=1",
        });
        setNotice(
          s(
            "إذا كان الحساب موجوداً ستصلك رسالة الاستعادة.",
            "If the account exists, a recovery email will arrive.",
          ),
        );
      } else if (mode === "reset") {
        await post("/api/auth/reset-password", {
          token: new URLSearchParams(location.search).get("token"),
          newPassword: password,
        });
        setNotice(
          s("تم تغيير كلمة المرور. سجل الدخول.", "Password changed. Sign in."),
        );
        setMode("login");
        history.replaceState({}, "", "/account");
      } else {
        const result = await post("/api/auth/sign-in/email", {
          email,
          password,
        });
        if (result.twoFactorRedirect) {
          setChallenge(true);
          return;
        }
        await reload();
      }
    });
  }
  useEffect(() => {
    if (new URLSearchParams(location.search).has("token")) setMode("reset");
  }, []);
  if (!loaded)
    return <div className="shell page">{s("جار التحميل…", "Loading…")}</div>;
  if (
    u &&
    !u.passwordChangeRequired &&
    (!internal || (u.mfa && ["ADMIN", "STAFF"].includes(u.role)))
  )
    return <>{children(u)}</>;
  if (u && internal && !["ADMIN", "STAFF"].includes(u.role))
    return (
      <div className="shell page">
        <h1>{s("الدخول مخصص للموظفين", "Staff access only")}</h1>
        <a href="/account">{s("حسابي", "My account")}</a>
      </div>
    );
  return (
    <div className="shell page">
      <div className="account-card form-panel">
        <a href="/">← {s("المتجر", "Store")}</a>
        <h1>
          {u?.passwordChangeRequired
            ? s("غيّر كلمة المرور الأولية", "Change your initial password")
            : challenge
              ? s("التحقق بخطوتين", "Two-factor verification")
              : u
                ? s("حماية حساب العمل", "Secure your staff account")
                : mode === "register"
                  ? s("حساب جديد", "Create an account")
                  : mode === "recovery"
                    ? s("استعادة الحساب", "Account recovery")
                    : mode === "reset"
                      ? s("كلمة مرور جديدة", "New password")
                      : s("أهلاً بعودتك", "Welcome back")}
        </h1>
        <p>
          {s(
            "متجر تجريبي — استخدم بيانات خيالية فقط.",
            "Demo store — use fictional data only.",
          )}
        </p>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p className="error-box" role="alert">
            {s("تعذر إكمال الطلب", "Request failed")}: {error}
          </p>
        )}
        {setup && (
          <div className="mfa-setup">
            <p>
              {s(
                "أضف هذا المفتاح إلى تطبيق المصادقة، واحفظ رموز الاسترداد في مكان آمن.",
                "Add this key to your authenticator and save the recovery codes securely.",
              )}
            </p>
            <label>
              {s("مفتاح المصادقة", "Authenticator secret")}
              <input
                readOnly
                value={new URL(setup.totpURI).searchParams.get("secret") || ""}
                dir="ltr"
              />
            </label>
            <details>
              <summary>{s("رموز الاسترداد", "Recovery codes")}</summary>
              <pre dir="ltr">{setup.backupCodes.join("\n")}</pre>
            </details>
          </div>
        )}
        <form onSubmit={submit} className="account-form">
          {challenge && !u?.passwordChangeRequired ? (
            <>
              <label>
                {backup
                  ? s("رمز استرداد", "Recovery code")
                  : s("رمز تطبيق المصادقة", "Authenticator code")}
                <input
                  autoComplete="one-time-code"
                  inputMode={backup ? "text" : "numeric"}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              {!setup && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setBackup(!backup)}
                >
                  {backup
                    ? s("استخدم تطبيق المصادقة", "Use authenticator")
                    : s("استخدم رمز استرداد", "Use recovery code")}
                </button>
              )}
            </>
          ) : (
            <>
              {mode === "register" && (
                <label>
                  {s("الاسم", "Name")}
                  <input
                    required
                    maxLength={160}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              {!u && mode !== "reset" && (
                <label>
                  {mode === "login"
                    ? s(
                        "البريد الإلكتروني أو اسم دخول المدير",
                        "Email or admin login",
                      )
                    : s("البريد الإلكتروني", "Email")}
                  <input
                    type={mode === "login" ? "text" : "email"}
                    autoComplete="username"
                    dir="ltr"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              )}
              {mode !== "recovery" && (
                <label>
                  {s("كلمة المرور", "Password")}
                  <input
                    type="password"
                    required
                    minLength={mode === "login" ? 1 : 12}
                    maxLength={128}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              )}
              {!!u?.passwordChangeRequired && (
                <label>
                  {s(
                    "كلمة المرور الجديدة (12 حرفاً على الأقل)",
                    "New password (at least 12 characters)",
                  )}
                  <input
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
              )}
            </>
          )}
          <button className="btn" disabled={busy}>
            {busy
              ? s("جار التنفيذ…", "Working…")
              : u?.passwordChangeRequired
                ? s("حفظ كلمة المرور", "Save password")
                : challenge
                  ? s("تحقق", "Verify")
                  : u
                    ? s("إعداد المصادقة", "Set up authenticator")
                    : mode === "register"
                      ? s("إنشاء حساب", "Create account")
                      : mode === "recovery"
                        ? s("إرسال رابط الاستعادة", "Send recovery link")
                        : mode === "reset"
                          ? s("حفظ كلمة المرور", "Save password")
                          : s("تسجيل الدخول", "Sign in")}
          </button>
        </form>
        {!u && !challenge && (
          <div className="account-links">
            <button
              onClick={() =>
                setMode(mode === "register" ? "login" : "register")
              }
            >
              {mode === "register"
                ? s("لدي حساب", "I have an account")
                : s("إنشاء حساب", "Create account")}
            </button>
            <button
              onClick={() =>
                setMode(mode === "recovery" ? "login" : "recovery")
              }
            >
              {mode === "recovery"
                ? s("تسجيل الدخول", "Sign in")
                : s("نسيت كلمة المرور؟", "Forgot password?")}
            </button>
          </div>
        )}
        {u && (
          <button
            className="text-button"
            onClick={() =>
              void run(async () => {
                await post("/api/auth/sign-out", {});
                await reload();
              })
            }
          >
            {s("تسجيل الخروج", "Sign out")}
          </button>
        )}
        {["localhost", "127.0.0.1"].includes(location.hostname) && email && (
          <details>
            <summary>
              {s("صندوق بريد التجربة المحلي", "Local demo mailbox")}
            </summary>
            <button
              className="text-button"
              onClick={() =>
                void run(async () =>
                  setMessages(
                    (
                      await api(
                        "/api/local/mail?email=" + encodeURIComponent(email),
                      )
                    ).messages,
                  ),
                )
              }
            >
              {s("تحديث الرسائل", "Refresh messages")}
            </button>
            {messages.map((m) => (
              <p key={m.url}>
                <a href={m.url}>
                  {m.subject === "Verify your email"
                    ? s("تأكيد البريد الإلكتروني", "Verify your email")
                    : s("استعادة كلمة المرور", "Reset password")}
                </a>
              </p>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}
function Orders({ u }: { u: User }) {
  const { i18n } = useTranslation(),
    ar = i18n.language === "ar";
  const [orders, setOrders] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api("/api/orders")
      .then((v) => setOrders(v.orders))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="shell page">
      <h1>{ar ? "حسابي وطلباتي" : "My account & orders"}</h1>
      <p dir="ltr">{u.email}</p>
      <div className="account-links">
        <a href="/shop">{ar ? "تسوق الآن" : "Continue shopping"}</a>
        {["ADMIN", "STAFF"].includes(u.role) && (
          <a href="/admin">{ar ? "إدارة المتجر" : "Store workspace"}</a>
        )}
        <button
          onClick={() =>
            void post("/api/auth/sign-out", {}).then(() => location.reload())
          }
        >
          {ar ? "تسجيل الخروج" : "Sign out"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!orders.length && (
        <p>{ar ? "لا توجد طلبات حتى الآن." : "No orders yet."}</p>
      )}
      {orders.map((o) => (
        <a className="customer-order" href={"/order/" + o.id} key={o.id}>
          <strong>{o.order_number}</strong>
          <span>{statusLabel(o.status, ar)}</span>
          <b>{money(o.total, "IQD", ar ? "ar" : "en")}</b>
          <small>{o.created_at}</small>
        </a>
      ))}
    </div>
  );
}
export const statusLabel = (v: string, ar: boolean) =>
  ({
    new: ar ? "جديد" : "New",
    preparing: ar ? "قيد التجهيز" : "Preparing",
    shipped: ar ? "خرج للتوصيل" : "Out for Delivery",
    completed: ar ? "تم التسليم" : "Delivered",
    cancelled: ar ? "ملغى" : "Canceled",
  })[v] || v;
export default function Account() {
  return <SessionGate>{(u) => <Orders u={u} />}</SessionGate>;
}
