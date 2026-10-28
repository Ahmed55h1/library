# مكتبتي | Maktabati

متجر قرطاسية وملازم مطبوعة ثنائي اللغة، مع واجهة React وواجهة API على Cloudflare Workers وقاعدة D1 وصور على R2. العربية هي اللغة الأولى؛ يمكن التبديل إلى الإنجليزية دون فقد السلة. الدفع عند الاستلام يعمل، والدفع الإلكتروني معطل إلى أن يتم اختيار بوابة حقيقية وربطها.

A bilingual stationery and printed study booklet store: React + TypeScript + Vite, Tailwind, i18next, Cloudflare Workers, D1, and R2 in one project. Arabic is the initial language. Cash on Delivery works; online payment stays disabled until a real gateway is selected and integrated.

## التشغيل المحلي | Local setup

تحتاج إلى Node.js حديث يدعم Vite (الإصدار المثبت لهذا المشروع يعمل مع Node 24)، وnpm. الأوامر التالية تعمل في Git Bash على Windows من مجلد المشروع. لا تحتاج إلى حساب Cloudflare للتطوير المحلي.

Use a current Node.js version supported by Vite (this project was developed with Node 24) and npm. Run these commands in Git Bash on Windows from this project directory. Local development needs no Cloudflare login.

```bash
cd school-supplies-store
npm install
npm run db:migrate
# اختياري: بيانات محلية للتجربة فقط / Optional local demonstration products
npm run db:seed
npm run admin:create -- --email owner@example.com
npm run dev
```

إذا كنت داخل مجلد `school-supplies-store` بالفعل، تجاهل أمر `cd`. يطلب أمر إنشاء المدير كلمة مرور لا تقل عن 12 حرفاً، ثم يحفظ تجزئتها فقط في D1 المحلي. لا توجد بيانات دخول افتراضية ولا صفحة عامة لإنشاء المدير. استخدم بريداً تملكه وكلمة مرور خاصة بك.

Skip `cd` if already inside `school-supplies-store`. The administrator command asks for a password of at least 12 characters and stores only its hash in local D1. There is no default administrator or public account creation endpoint. Choose your own email and password.

إذا لم تدعم نافذة Git Bash إدخال كلمة المرور التفاعلي المخفي، استخدم الطريقة التالية. لا تُكتب كلمة المرور ضمن الأمر أو في ملف.

If your Git Bash terminal does not expose an interactive TTY to Node, use this hidden-input alternative. The password stays out of command arguments and files:

```bash
read -rsp 'Choose an administrator password (12+ characters): ' MAKTABATI_ADMIN_PASSWORD
echo
export MAKTABATI_ADMIN_PASSWORD
npm run admin:create -- --email owner@example.com --password-env MAKTABATI_ADMIN_PASSWORD
unset MAKTABATI_ADMIN_PASSWORD
```

- المتجر | Storefront: <http://localhost:5173/>
- الإدارة | Admin: <http://localhost:5173/admin>

هذه عناوين محلية على جهازك وليست روابط عامة. المنفذ ثابت؛ إذا كان مشغولاً أوقف العملية الأخرى أو عدل إعداد التشغيل. لإيقاف الخادم اضغط `Ctrl+C`. لإعادة تشغيله استخدم `npm run dev` من مجلد المشروع. بيانات D1 وR2 المحلية محفوظة في `.wrangler/state` وتبقى بعد إعادة التشغيل؛ لا تحذف هذا المجلد إذا أردت الاحتفاظ بها.

These addresses are local to your computer, not public URLs. The port is fixed; stop another process using it or update the development configuration. Stop with `Ctrl+C`; restart with `npm run dev` from this directory. Local D1 and R2 persist in `.wrangler/state` across restarts. Keep that directory to retain local business data.

## الإدارة والمحتوى | Administration and content

من `/admin` يمكنك تعديل اسم المتجر وشعاره ووسائل الاتصال والعملة واللغة الافتراضية، وإدارة أسعار التوصيل حسب المحافظة. يمكن إضافة الأصناف وترتيبها بالسحب أو بأزرار التحريك، وإخفاؤها ونقل منتجاتها إلى صنف آخر قبل حذفها. يمكن إضافة المنتجات وتعديل مخزونها وأسعارها وصورها وترتيبها وصنفها، مع حقول المادة والمرحلة واسم المدرس للملازم المطبوعة.

At `/admin`, edit the store name, logo, contacts, currency, default language, and delivery fees by governorate. Create, hide, and reorder categories using drag and drop or movement buttons. Move products to another category before deleting their category. Manage product names, descriptions, stock, prices, images, category, and ordering. Printed booklet fields include subject, academic level, and teacher name.

تُعرض المبيعات المحصّلة بعملة المتجر المحددة حالياً؛ وتحتفظ الطلبات بعملتها الأصلية.

Collected sales are shown for the current configured currency; orders retain their original currency.

يلزم الاسم العربي والإنجليزي للنشر. إذا لم تتوفر ترجمة وصف اختياري، يظهر الوصف باللغة المتاحة. البحث يشمل الاسمين والوصفين. تنسيق الأسعار والأرقام يتبع لغة العرض، ولا يغير السعر أو يحول العملة. تغيير عملة المتجر إعداد للمبالغ الجديدة وليس تحويلاً بسعر صرف؛ راجع أسعارك عند تغييرها. يحتفظ كل طلب بالعملة والأسعار وقت الشراء.

Publication requires both Arabic and English names. Optional descriptions explicitly fall back to the available language. Search covers both languages. Display language changes number formatting, not product prices or currency. Changing store currency does not perform foreign exchange conversion; review your prices when changing it. Orders retain currency and price snapshots.

تقبل الصور المرفوعة PNG وJPEG وWebP حتى 5 ميغابايت مع فحص ترويسة الملف. الصور التجريبية SVG ثابتة ضمن المشروع؛ رفع SVG من لوحة الإدارة غير مسموح.

Uploads accept PNG, JPEG, and WebP up to 5 MiB with file signature checks. Bundled sample SVG illustrations are part of the project; administrator SVG uploads are rejected.

## الطلبات والدفع | Orders and payment

السلة محفوظة محلياً؛ المنتجات والطلبات والإعدادات في D1. تتم مراجعة الكميات والأسعار ورسوم التوصيل على الخادم. يحجز الطلب المخزون بصورة ذرية ويستخدم مفتاحاً لمنع تكرار الطلب عند إعادة الإرسال. تحفظ بيانات العميل في طلب محمي برمز وصول خاص، ويمكن للمدير عرضها بعد تسجيل الدخول. إلغاء الطلب يعيد المخزون مرة واحدة. حالات الطلب منفصلة عن حالة الدفع.

The cart is stored locally; business records live in D1. The server validates quantities and calculates product and delivery totals. Atomic inventory changes prevent overselling, and an idempotency key prevents duplicate orders on resubmission. Order details require a private access token or administrator session. Cancellation restores stock once. Fulfilment and payment statuses are separate.

الدفع عند الاستلام جاهز. لتفعيل الدفع الإلكتروني نحتاج اسم بوابة تدعم التاجر في العراق وعملة IQD، وحساب تاجر مقبول، ومفاتيح بيئة الاختبار، ووثائق API، وسر توقيع webhook، وروابط العودة وwebhook على عنوان HTTPS. يلزم تنفيذ موصل البوابة ثم اختبار التحقق من الدفع على الخادم وتوقيع webhook ومنع تكرار المعالجة قبل استخدام مفاتيح الإنتاج. تفاصيل التهيئة في [دليل النشر](docs/DEPLOYMENT.md).

Cash on Delivery is ready. Online payment activation requires a gateway supporting an Iraqi merchant and IQD, an approved merchant account, sandbox credentials, API documentation, a webhook signing secret, and HTTPS return/webhook URLs. Its adapter must then be implemented and tested for server verification, authenticated webhooks, and duplicate transaction protection before using production credentials. See [deployment](docs/DEPLOYMENT.md).

## الفحص والبناء | Validation and build

```bash
npm run typecheck
npm run build
```

لفحص التكامل كاملاً دون إنشاء حساب اختبار يدوياً، أبقِ الخادم المحلي يعمل وشغل:

For the complete local integration suite without manually creating a test account, leave the development server running and run:

```bash
npm run test:e2e
# لإعادة فحص المتصفح فقط / To rerun only browser checks
npm run test:e2e -- --ui-only
```

ينشئ هذا الأمر مديراً محلياً مؤقتاً بكلمة مرور عشوائية في ذاكرة العملية، ويفحص API والمتصفح ثم يحذف حساب الاختبار. لا يطبع كلمة المرور. يجب تهيئة D1 المحلي وتحميل البيانات التجريبية أولاً.

This command creates a temporary local administrator with a random password held in process memory, runs API/browser checks, then removes that account. It does not print the password. Initialize local D1 and load the sample catalog first.

لفحص API، شغل الخادم أولاً وافتح نافذة Git Bash ثانية. أنشئ مديراً محلياً للاختبار إذا لم يوجد، ثم أدخل نفس بياناته دون حفظ كلمة المرور في ملفات:

For API integration tests, leave the server running and open another Git Bash terminal. Create a local test administrator if needed; enter its credentials without placing the password in files:

```bash
read -rp 'Local test administrator email: ' TEST_ADMIN_EMAIL
read -rsp 'Local test administrator password: ' TEST_ADMIN_PASSWORD
echo
export TEST_ADMIN_EMAIL TEST_ADMIN_PASSWORD
npm run test:api
npm run test:ui
unset TEST_ADMIN_EMAIL TEST_ADMIN_PASSWORD
```

يمكن تعيين `BASE_URL` لاختبار منفذ محلي آخر. الاختبارات مخصصة لقاعدة التطوير: تنشئ بيانات تبدأ بـ `QA`، وتفحص المصادقة والصلاحيات وترتيب الأصناف ورفع R2 والتسعير والمخزون والطلبات المتزامنة والتكرار والإلغاء. تنظف المنتجات والأصناف المؤقتة وتبقي الطلبات الملغاة كسجل فحص. لا تشغلها على قاعدة متجر حقيقي.

Set `BASE_URL` to test another local port. The suite targets a development database: it creates records prefixed `QA` and checks authentication, authorization, category ordering, R2 uploads, server pricing, inventory, concurrent orders, retries, and cancellation. It cleans up temporary products/categories and retains cancelled test orders as an audit trail. Run it against development data.

فحص المتصفح يستخدم Playwright وChrome المثبت على Windows (أو Edge إذا لم يوجد Chrome). يمكن اختيار Edge بواسطة `PLAYWRIGHT_CHANNEL=msedge npm run test:ui`. إذا لم يتوفر أي منهما، ثبت Chromium بـ `npx playwright install chromium`. تحفظ صور سطح المكتب والهاتف ولقطات الفشل في `test-results/`، والتقرير في `playwright-report/`؛ هذه الملفات مستبعدة من Git. يجب تشغيل الخادم والبيانات التجريبية قبل الفحص.

Browser tests use Playwright with installed Windows Chrome, or Edge when Chrome is unavailable. Select Edge with `PLAYWRIGHT_CHANNEL=msedge npm run test:ui`. If neither browser is installed, run `npx playwright install chromium`. Desktop/mobile screenshots and failure evidence go to `test-results/`; the HTML report goes to `playwright-report/`. These are ignored by Git. Start the server and load sample data before testing.

فحص المتصفح: بدّل اللغة ثم حدث الصفحة، وتحقق من `lang` و`dir` والسلة. اختبر عرض الهاتف، وصفحة الصنف والمنتج، وطلباً بالدفع عند الاستلام ثم اعرضه في لوحة الإدارة. راجع [قائمة الفحص](docs/TESTING.md).

Browser checks: switch languages and refresh; inspect `lang`, `dir`, and persisted cart. Check a phone viewport, category/product pages, and Cash on Delivery checkout, then find the order in admin. See the [test checklist](docs/TESTING.md).

## بنية المشروع | Project structure

| Path                       | Purpose / الغرض                                                           |
| -------------------------- | ------------------------------------------------------------------------- |
| `src/`                     | React storefront, admin, bilingual translation files / الواجهات والترجمات |
| `worker/`                  | Workers API, authentication, validation / الخادم والمصادقة                |
| `migrations/`              | D1 schema and initial category/settings records / قاعدة البيانات          |
| `scripts/seed.sql`         | Optional 12 local sample products / بيانات محلية اختيارية                 |
| `scripts/create-admin.mjs` | CLI administrator creation / إنشاء المدير                                 |
| `tests/api.test.mjs`       | Real local D1/R2 API integration checks / فحص التكامل                     |
| `wrangler.jsonc`           | Worker, D1, R2 bindings / موارد Cloudflare                                |

## النشر لاحقاً | Deployment later

التطبيق مجهز للنشر على Workers مع D1 وR2؛ لم يتم نشره كجزء من إعداد التطوير. اتبع [دليل النشر العربي والإنجليزي](docs/DEPLOYMENT.md) لإنشاء الموارد وإعداد المعرفات والأسرار وتطبيق migrations وإنشاء المدير في قاعدة الإنتاج. البيانات التجريبية لا تُدرج في الإنتاج تلقائياً.

The project is prepared for Workers + D1 + R2 deployment; local setup does not deploy it. Follow the [Arabic/English deployment guide](docs/DEPLOYMENT.md) to create resources, set identifiers/secrets, apply migrations, and create the production administrator. Sample data is never automatically inserted into production.
