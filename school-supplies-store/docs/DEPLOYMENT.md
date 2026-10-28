# النشر على Cloudflare | Cloudflare deployment

هذه خطوات مرحلة النشر اللاحقة. التطوير المحلي مستقل عنها. تحتاج حساب Cloudflare بصلاحيات Workers وD1 وR2، وتفعيل R2 في الحساب. لا تنشر بيانات الاختبار أو كلمات المرور أو ملفات `.dev.vars` أو `.env`.

These steps are for the later deployment stage; local development works independently. You need a Cloudflare account with permission to use Workers, D1, and R2, and an enabled R2 subscription. Keep test credentials and local secret files out of Git.

## 1. الموارد والإعداد | Resources and configuration

من Git Bash داخل مجلد المشروع:

From Git Bash in the project directory:

```bash
npx wrangler login
npx wrangler d1 create school-supplies-store
npx wrangler r2 bucket create maktabati-product-images
```

انسخ UUID الناتج عن إنشاء D1 إلى `database_id` في `wrangler.jsonc` بدلاً من المعرف المحلي الوهمي. احتفظ باسم الربط `DB`. اضبط `bucket_name` إلى اسم R2 الذي أنشأته واحتفظ بالربط `IMAGES`. يمكن اختيار أسماء موارد فريدة أخرى؛ عدل أسماء قاعدة البيانات في أوامر المشروع إذا غيرتها. `ASSETS` يقدم ملفات React المبنية، و`/api/*` يعالجها Worker أولاً.

Replace the placeholder `database_id` in `wrangler.jsonc` with the UUID returned by D1 creation. Keep the binding named `DB`. Set R2 `bucket_name` to your actual bucket and retain the `IMAGES` binding. If you choose other resource names, also update the database names used in project commands. `ASSETS` serves the built React files; the Worker handles `/api/*` first.

لا تضف `remote: true` للموارد إذا أردت استمرار التطوير باستخدام المحاكاة المحلية. الصور تُقدم من مسار API على نفس النطاق باستخدام ربط R2؛ لا تحتاج جعل الحاوية عامة أو وضع مفتاح R2 في المتصفح.

Keep resources local during development by leaving `remote: true` unset. Images are served through the same-origin API using the R2 binding. A public bucket or browser R2 credential is unnecessary.

راجع توثيق [أوامر D1](https://developers.cloudflare.com/d1/wrangler-commands/) و[إعداد R2](https://developers.cloudflare.com/r2/get-started/).

See the official [D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/) and [R2 setup](https://developers.cloudflare.com/r2/get-started/) references.

## 2. قاعدة الإنتاج والمدير | Production database and administrator

```bash
npx wrangler d1 migrations apply school-supplies-store --remote
npm run admin:create -- --email owner@example.com --remote
```

أدخل كلمة مرور المدير عندما يطلبها الأمر. ينشئ البرنامج تجزئة PBKDF2 بملح عشوائي، ثم يكتب الحساب إلى D1 المحدد. لا توجد بيانات دخول مضمنة في الكود. لإنشاء مدير آخر كرر الأمر ببريد مختلف. عند تمرير `--remote` تحتاج صلاحيات حساب Cloudflare الصحيح.

Enter the administrator password when prompted. The script generates a salted PBKDF2 hash and writes the account to the selected D1 database. Credentials are not embedded in source. Repeat with another email to create another administrator. `--remote` requires authorization for the intended Cloudflare account.

تحتوي migration الأولى على الأصناف والإعدادات الأساسية فقط. لا تشغل ملف `scripts/seed.sql` على الإنتاج؛ أمر `npm run db:seed` مقيد بـ `--local`. أضف منتجات المتجر الحقيقية من لوحة الإدارة.

The initial migration contains baseline categories and settings only. `npm run db:seed` explicitly targets `--local`; keep `scripts/seed.sql` out of production initialization. Add real merchandise through admin.

## 3. الأسرار | Secrets

لا يحتاج الدفع عند الاستلام مفتاح بوابة. تستخدم الجلسات رموزاً عشوائية تحفظ تجزئاتها في D1. أي مفاتيح خارجية مستقبلية تكون أسرار Worker، وليس متغيرات `VITE_*` أو حقول إعدادات عامة:

Cash on Delivery needs no gateway key. Sessions use random tokens whose hashes are stored in D1. Future external credentials belong in Worker secrets, never `VITE_*` variables or public settings:

```bash
# عند تنفيذ موصل بوابة حقيقي فقط / Only after implementing a real gateway adapter
npx wrangler secret put PAYMENT_API_KEY
npx wrangler secret put PAYMENT_WEBHOOK_SECRET
```

هذه أسماء توضيحية؛ الموصل الفعلي يجب أن يحدد الأسرار المطلوبة في نوع `Env`. وضع أسرار بهذه الأسماء وحده لا يفعل الدفع. محلياً استخدم `.dev.vars` غير المضاف إلى Git؛ مثال الإعداد خالٍ من القيم السرية. في CI استخدم رمز Cloudflare محدود الصلاحيات كسر للمنصة. راجع [أسرار Workers](https://developers.cloudflare.com/workers/configuration/secrets/).

These are illustrative names; the actual adapter must define its required bindings in `Env`. Merely setting them does not enable payment. For local development use an ignored `.dev.vars`, with no real values in the example file. In CI, store a scoped Cloudflare API token in the CI secret store. See [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## 4. البناء والنشر | Build and publish

```bash
npm ci
npm run typecheck
npm run build
npm run deploy
```

يقوم أمر `deploy` بالبناء ثم يستعمل Wrangler لنشر المخرجات التي أنشأها Cloudflare Vite Plugin. افتح عنوان `workers.dev` الحقيقي الذي يطبعه Wrangler، ثم `/admin`، وسجل الدخول بحساب الإنتاج. اضبط اسم المتجر والاتصال ورسوم التوصيل والمخزون قبل استقبال طلبات حقيقية. اختبر طلباً واحداً ثم ألغِه إذا كان اختباراً. يمكن إضافة نطاق مخصص لاحقاً من إعدادات Worker.

`deploy` builds and uses Wrangler to deploy the Cloudflare Vite Plugin output. Open the actual `workers.dev` URL printed by Wrangler, then `/admin`, and sign in with the production account. Configure store identity, contacts, delivery, and stock before taking live orders. Verify checkout with one marked test order and cancel it afterward. Add a custom domain later through Worker settings.

التطوير المحلي والإنتاج لهما قواعد وملفات منفصلة. لا ينقل النشر قاعدة `.wrangler/state` أو الصور المحلية إلى الإنتاج تلقائياً. ارفع الصور الفعلية من إدارة الإنتاج، واستخدم نسخ D1 الاحتياطية قبل أي migration يغير بيانات موجودة.

Deployment does not transfer `.wrangler/state` or local image uploads to production. Upload production images through the production admin. Back up existing D1 data before a migration that changes stored records.

## 5. المطلوب لتفعيل الدفع الإلكتروني | Online payment activation requirements

الدفع الإلكتروني معطل بوضوح. لتفعيله يلزم تزويد المطور بما يلي:

Online payment is explicitly disabled. Activation needs:

1. اسم بوابة تقبل التاجر المسجل في العراق وتدعم تحصيل IQD، وتأكيد أهلية حساب المتجر. / A named gateway accepting the registered Iraqi merchant and IQD, with confirmed account eligibility.
2. حساب تاجر مقبول، ورقم التاجر، ومفاتيح sandbox، ووثائق API والإصدارات المعتمدة. / Approved merchant account, merchant ID, sandbox credentials, and API/version documentation.
3. طريقة توقيع webhook والسر الخاص به، وعنوان HTTPS دائم للاستقبال والعودة، وحالات الفشل والاسترجاع. / Webhook signing method/secret, stable HTTPS webhook and return URLs, and documented failure/refund states.
4. تنفيذ موصل خادمي يبدأ الدفع ويطابق المبلغ والعملة والطلب مع استجابة التحقق، مع سجل معاملات فريد يمنع تكرار المعالجة. / A server adapter that initiates payment, verifies amount/currency/order against the gateway, and uses unique transaction records to prevent replay.
5. فحص توقيع webhook وإعادة الإرسال والفشل والنجاح في sandbox، ثم إضافة أسرار الإنتاج بعد الموافقة. / Sandbox verification of authentic webhooks, retries, failures, and success; production secrets only after approval.

لا تجمع بيانات البطاقات في التطبيق. استخدم صفحة الدفع المستضافة المعتمدة من البوابة عند تنفيذ الربط. لا تعتبر صفحة العودة وحدها إثباتاً للدفع؛ قرار حالة الدفع يكون على الخادم.

Keep card details outside this application; use the gateway's approved hosted checkout when integrating it. A return URL alone does not prove payment; the server decides payment status from verified gateway information.
