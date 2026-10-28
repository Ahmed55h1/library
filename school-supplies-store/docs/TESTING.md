# فحص التطبيق | Application verification

شغل قاعدة التطوير والخادم، ثم نفذ `npm run typecheck` و`npm run build`. يتطلب `npm run test:api` متغيري `TEST_ADMIN_EMAIL` و`TEST_ADMIN_PASSWORD` لحساب محلي. لا تضع كلمة المرور في الكود أو Git. تعليمات Git Bash في [README](../README.md).

Initialize local D1 and start the development server. Run `npm run typecheck` and `npm run build`. `npm run test:api` requires `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` for a local account; keep the password outside source and Git. See [README](../README.md) for Git Bash commands.

الأمر `npm run test:e2e` يشغل الفحصين وينشئ حساباً محلياً مؤقتاً عشوائي البيانات ثم يحذفه. استخدم `npm run test:e2e -- --ui-only` لإعادة فحص المتصفح فقط. لا يحتاج هذا الأمر إلى بيانات مدير يدوية؛ يحتاج إلى الخادم وقاعدة التطوير والمنتجات التجريبية.

`npm run test:e2e` runs both suites with a temporary randomly generated local administrator and removes the account afterward. Use `npm run test:e2e -- --ui-only` to repeat browser checks alone. This wrapper needs no manually supplied admin credentials; it needs the running local server, initialized development database, and sample products.

## فحص API تلقائي | Automated API checks

- أصناف ومنتجات منشورة باللغتين. / Published bilingual catalog records.
- رفض الدخول غير المصرح وكلمة المرور الخاطئة، وقبول المدير الصحيح وتسجيل الخروج. / Unauthorized access and wrong-password rejection; valid login and logout.
- إنشاء صنف وترتيبه وإعادة قراءته من قاعدة البيانات، ونقل المنتجات قبل حذفه. / Category creation, persisted reordering, and transfer before category deletion.
- اسمين مطلوبين للنشر، وتحديث المنتج والمخزون وحقول الملازم. / Bilingual publication validation, product/inventory updates, and booklet metadata.
- رفض ملف يتظاهر بأنه صورة، ورفع PNG إلى R2 واسترجاع نفس البايتات. / Fake image rejection and a byte-verified R2 PNG round trip.
- حساب الأسعار ورسوم التوصيل على الخادم وتجاهل أسعار المتصفح. / Server-calculated pricing and delivery, ignoring browser amounts.
- حفظ الطلب وبنوده، وإنقاص المخزون، وحماية بيانات الطلب برمز خاص. / Order/item snapshots, stock decrement, and access-token privacy.
- منع التكرار وإعادة استخدام المفتاح بمحتوى مختلف، ومنع بيع آخر قطعة مرتين بالتزامن. / Duplicate prevention, key conflicts, and concurrent final-unit oversell prevention.
- رفض كميات غير صحيحة والدفع الإلكتروني غير المتاح. / Invalid quantity and unavailable online payment rejection.
- ظهور الطلب للإدارة وتغيير حالته وإعادة المخزون عند الإلغاء مرة واحدة. / Administrative order retrieval/status updates and exactly-once cancellation restock.
- رفض طلبات الإدارة القادمة من نطاق آخر. / Rejection of cross-origin administrative writes.

تُنشأ بيانات مؤقتة تبدأ بـ `QA`. تبقى الطلبات الملغاة كسجل فحص؛ لا تنفذ الاختبارات على متجر إنتاجي.

Tests create records prefixed `QA` and retain cancelled test orders as an audit trail. Use a development database.

## فحص المتصفح التلقائي | Automated browser checks

```bash
# شغل الخادم أولاً، ثم عين بيانات مدير الاختبار / Start the server and set test admin credentials first
npm run test:ui
```

تشغل Playwright متصفح Chrome المثبت دون نافذة تفاعلية، أو Edge إذا لم يتوفر Chrome. يمكن تغيير القناة بمتغير `PLAYWRIGHT_CHANNEL`. لا يتصل الفحص بأي متجر أو خدمة دفع خارجية.

Playwright launches installed Chrome headlessly, falling back to Edge. Set `PLAYWRIGHT_CHANNEL` to override the channel. Tests contact only the local store; no external payment service is used.

يغطي الفحص تغيير اللغة وRTL/LTR والثبات بعد التحديث، والبحث بلغتي المنتج، وصفحات الأصناف والمنتجات، والسلة والكميات. يغطي أيضاً الدخول الخاطئ والصحيح إلى الإدارة، وإنشاء صنف وترتيبه وإخفاءه ونشره، وإنشاء منتج مع رفع صورة وتغيير المخزون، وطلب زائر من عرض الهاتف، ورسائل التحقق، وتأكيد الطلب باللغتين، والعثور عليه في الإدارة وتغيير حالته. تفحص الشاشات عرض 1440 و390 بكسل وعدم تجاوز عرض الصفحة، وتلتقط صوراً للمراجعة البصرية.

Coverage includes language/RTL/LTR switching and refresh persistence, search in both content languages, category/product pages, and cart quantities. The admin workflow tests wrong/valid login, category creation/order/hide/publish, product creation with image upload and stock editing, mobile guest checkout, localized validation, bilingual confirmation, and finding/updating the order in admin. It checks 1440px and 390px layouts for page overflow and saves screenshots for visual review.

الصور وملفات تتبع الفشل في `test-results/`؛ التقرير في `playwright-report/`. ينظف الفحص الأصناف والمنتجات المؤقتة، ويلغي الطلب الذي أنشأه ويحتفظ بسجله.

Screenshots and failure traces are in `test-results/`; the HTML report is in `playwright-report/`. The workflow removes its temporary merchandise and categories, cancels its order, and retains that audit record.

## فحص المتصفح | Browser checklist

| الفحص / Check                                                         | النتيجة المتوقعة / Expected                               |
| --------------------------------------------------------------------- | --------------------------------------------------------- |
| افتح المتجر دون تفضيل لغة سابق / Fresh storefront visit               | Arabic; `<html lang="ar" dir="rtl">`                      |
| اختر English / Select English                                         | English labels/content; `<html lang="en" dir="ltr">`      |
| حدث الصفحة وتنقل / Refresh and navigate                               | Selected language remains                                 |
| أضف منتجاً ثم بدّل اللغة / Add product then switch language           | Cart contents and quantity remain; prices only reformat   |
| ابحث بالاسم العربي والإنجليزي / Search both product languages         | Same matching product appears                             |
| افتح صنفاً ومنتجاً / Open category and product                        | Database content and correct breadcrumbs/details          |
| منتج مخزونه صفر / Out-of-stock product                                | Clear state and disabled purchase action                  |
| عدل كمية السلة / Update cart quantity                                 | Stock limit, subtotal, delivery, and total agree          |
| ضع طلباً بالدفع عند الاستلام / Place COD order                        | Confirmation number/items/totals in current language      |
| حدث صفحة التأكيد / Refresh confirmation                               | Access-controlled order summary loads                     |
| افتح /admin دون جلسة / Open admin without session                     | Login form; private order/customer data unavailable       |
| سجل الدخول ثم أنشئ صنفاً ومنتجاً وصورة / Admin category/product/image | Saved changes appear after reload and in storefront       |
| أعد ترتيب الأصناف بالسحب والأزرار / Drag and button reorder           | Same persisted order in both languages                    |
| غيّر حالة الطلب / Change order status                                 | Separate fulfilment and payment states                    |
| عرض هاتف بعرض 390px وعرض حاسوب / Phone 390px and desktop              | No page overflow; usable menu, cards, checkout, and admin |

عند فشل أي فحص، سجل المسار واللغة والخطوات والنتيجة ثم أصلحه وأعد فحص السلوك المتأثر.

For failures, record path, language, steps, and observed result; fix the issue and rerun the affected checks.
