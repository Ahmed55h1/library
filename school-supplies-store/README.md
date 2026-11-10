# مكتبتي | Maktabati

Arabic-first school bookstore for fictional stationery, printed study booklets, and other school products. Switch to English to change the complete interface to LTR. Responsive customer and staff interfaces, sample SVG illustrations, whole Iraqi dinar prices, and a clearly labeled demo checkout. There are no real payments or deliveries.

TypeScript on both sides: React 19 + Vite, Hono, Better Auth using its native D1 adapter (`database: env.DB`), SQL migrations, and one Cloudflare Worker serving assets and API from the same origin. Node.js 24 LTS and npm were used for validation.

## Run locally

From this directory in PowerShell, Command Prompt, or a terminal:

```sh
npm ci
npm run init:local
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://127.0.0.1:5173/**. Use this exact origin, including the IP address: authentication and CSRF checks intentionally reject a different origin. `init:local` creates an ignored `.dev.vars` with a random auth secret and preserves an existing file. Development binds only to loopback. Local D1 is stored in `.wrangler/state`; keep it to retain data. Run the optional seed once on a new database; it adds 12 fictional products. Do not seed a real store.

- `/`: storefront; `/shop`: search and category filtering; `/cart`: quantities.
- `/account`: register, sign in, password recovery, and your own orders.
- `/checkout`: signed-in demo delivery details, server quote, then confirmation.
- `/admin`: admin/staff workspace; a verified factor is mandatory.

Local email verification and recovery use a **local demo mailbox** shown on the account form after entering an email. Refresh messages and follow the verification or reset link. This mailbox is intentionally available only with `APP_ENV=local` on loopback. It is blocked in hosted mode. Use fictional email addresses, names, phone numbers, and addresses for local testing.

For Wrangler without the Vite development server, build first, stop Vite, and run:

```sh
npm run build
npm run dev:worker
```

This serves the built frontend and API on the same `127.0.0.1:5173` origin. `npm run preview` is also available via the Cloudflare Vite plugin on that origin. Stop a server with Ctrl+C. Run only one server at a time on port 5173.

## First administrator and staff

1. Register the intended owner at `/account` and verify the email using the local mailbox (or real email delivery on the hosted demo).
2. Run `npm run admin:create -- --email verified-owner@example.test`. The normal CLI promotes an existing verified account only when **no administrator exists** and writes a bootstrap audit entry. Reruns preserve the existing administrator and password. For the private remote demo, add `--remote` only after configuring its D1 database and confirming that this is the intended database. The explicit isolated local test-account procedure is documented below.
3. Open `/admin`, sign in, enter the password to enroll an authenticator, add the displayed secret to your authenticator app, save the recovery codes securely, and enter the current code. Enrollment alone does not grant access. Future sign-ins require an authenticator code or a one-use recovery code.
4. Staff register and verify their own accounts first. Under **Accounts & permissions**, change the account to `STAFF` and save. Every promotion starts empty. Then select the individual permissions and save again. Admins can disable staff and return staff to customers. Public registration and profile edits cannot set roles or grants. Creation of further administrators is deliberately outside the staff interface; an operator must use controlled database maintenance and record the action.

| Permission | Allowed operation |
| --- | --- |
| `categories.manage` | Create/edit/delete empty categories; visibility and numeric display order |
| `products.describe` | Product names, descriptions, sample/image URL, study metadata |
| `prices.edit` | Product price only |
| `stock.adjust` | Inventory quantity only |
| `orders.read` | Internal order list and delivery details |
| `orders.update` | Valid status transitions for a specified order |

Product creation/archive, product category/visibility/order, delivery zones/fees, accounts, grants, and audit review are admin-only. Staff with no permissions cannot read internal data. Order updating and order reading are separate permissions; update-only staff can use the status form with an internal order ID supplied by their administrator, or call `PATCH /api/admin/orders/:id` with a permitted `status`. Both roles require factor verification for the current session before any internal request. Authorization reads current account state and grants from D1 on every request; revocation and disablement take effect on the next request.

### One-time private test administrator

Use a separate local D1 state directory. This operation is deliberately unavailable through the public API and rejects `--remote`:

```powershell
node node_modules/wrangler/bin/wrangler.js d1 migrations apply school-supplies-store --local --persist-to .wrangler/private-release-v0.1.0
npm run admin:create -- --test-setup --persist-to .wrangler/private-release-v0.1.0 --email admin@maktabati.example.test
```

Enter the initial password at the hidden prompt, or supply it through the server-side `MAKTABATI_TEST_ADMIN_PASSWORD` secret in an automation environment. Do not put its value in configuration, command arguments, or logs. The CLI uses Better Auth's password hashing implementation and creates the explicitly verified fictional test identity with role `ADMIN`, login `ADMIN`, and a mandatory password-change flag. The 11-character exception exists only in this offline local setup operation; registration, recovery, and new passwords still require 12+ characters. Existing accounts/passwords are preserved on reruns. Normal staff and customers continue to use verified email sign-in.

At first sign-in, change the password before accessing the dashboard, then enroll/verify two-factor authentication. The server enforces both checks. Disabling an account or changing its role deletes its `session` and `mfa_sessions` rows transactionally; reactivation never restores them. Sign in again after promotion or reactivation. For a private local preview use the built Worker with `--persist-to .wrangler/private-release-v0.1.0`; do not point it at the ordinary development or remote database.

### Private wrappers and source handoff

See [packaging/README.md](packaging/README.md) for Tauri 2 Windows x64/Android builds, exact missing prerequisites, external signing, installation, and platform acceptance steps. No native installer/APK has been built or installed here. Generate the secret-free source archive with `python scripts/package-source.py`; output and SHA256 are in ignored `artifacts/`. It includes both lockfiles, placeholder `.dev.vars.example`, development scripts, tests, and all migrations. It excludes secrets, signing keys, local databases, dependencies, generated builds, Git metadata, and test/browser reports.

## Checkout and data integrity

`POST /api/checkout/quote` accepts only product IDs, integer quantities, and a zone, and stores a 10-minute quote belonging to the authenticated account. The UI shows its server-calculated item prices, subtotal, delivery fee, and total before a separate confirmation button. `POST /api/orders` accepts only `quote_id`, `idempotency_key` (UUID), and `shipping` (name, phone, zone, area, address, optional delivery notes). It accepts no client prices, fees, totals, payment fields, or account identity.

One D1 `batch` claims the quote and inserts the order, all price/name/image snapshots, inventory reservations, and audit events. SQL triggers recheck stock, product/category visibility, confirmed prices/names, delivery fees, currency, quote ownership, and expiration inside the transaction. A failing item rolls back the claim, complete order, earlier stock reservations, and audits. Identical confirmation retries return the existing order even with a different key or after quote expiration; conflicting payloads, key reuse, or another account return a conflict. Historical quote claims are backfilled without deleting previous orders. Purchase-time delivery address, fees, prices, and totals remain on the order.

Product forms submit only changed fields. Stock changes additionally send `expected_stock`, the stock originally loaded by the form; the server conditionally writes against that value and returns `STOCK_CHANGED` on conflict. Description-only changes cannot overwrite stock. Admin order summaries contain only displayed fields; contact/address details are fetched on demand under `orders.read`.

The database and API enforce `New → Preparing → Out for Delivery → Delivered`. `New` and `Preparing` can instead become `Canceled`. Cancellation restores inventory in the same transaction once, including concurrent repeated cancellation. Cancellation after dispatch and reopening terminal orders are rejected. Persisted status keys are `new`, `preparing`, `shipped`, `completed`, `cancelled`; displayed labels are Arabic or the requested English names.

## Security and operations

- Better Auth stores sessions in D1; cookie caching is disabled. Cookies are HttpOnly and SameSite=Strict, and Secure when hosted. HTTP is allowed only for loopback development.
- Internal factor assurance is stored in `mfa_sessions` for the exact session after a successful Better Auth authenticator/recovery-code response. An enrolled flag, forged cookie, trusted-device sign-in, or client state cannot substitute for that proof. Disabling two-factor clears session proofs. Password recovery revokes existing sessions.
- Every mutation requires the configured exact Origin, same-site Fetch Metadata when supplied, JSON content type, and a bounded request body. Zod strict schemas reject unexpected update fields, and application SQL values are parameterized. SQL column names come only from validated schemas.
- D1-backed rate limits apply across isolates: sign-in/registration/recovery/reset routes 5 requests per 15 minutes per IP/route, all auth mutations 30/minute, factor verification 8/5 minutes, plus quote/confirmation limits. Better Auth also enforces one-use recovery codes and factor failure lockout. Avoid changing IP trust headers in a reverse proxy; hosted requests must enter through Cloudflare.
- Price/stock edits, grants, order creation/status, stock reservations/restoration, delivery settings, and category changes write actor/timestamp audit records atomically with the action. Application routes cannot update/delete audit records; database triggers reject both. Database operators remain trusted and should export audit records outside D1 for independent retention.
- `.dev.vars`, local runtime state, dependencies, builds, browser traces, and reports are ignored. Keep the auth secret stable: it encrypts authenticator secrets. Hosted mail uses Resend via `MAIL_API_KEY` and `MAIL_FROM`; configure a verified sender. No credentials or business data are seeded.
- Legacy custom administrator/session tables from migration 0001 are retained for recovery compatibility but are not consulted by the new authentication implementation. Existing legacy administrators must register and verify a Better Auth account; no password/session is migrated silently.

## Tests and actual results

```sh
npm run build
npm run test:api
npm run test:ui
# Both isolated suites after the build:
npm run test:e2e
```

`test:api` loads the **actual built Worker modules** in isolated Miniflare/workerd runtimes with disposable D1 databases. Always rebuild after application changes. `test:ui` creates a separate temporary Wrangler configuration, auth secret and D1 state, applies all migrations, seeds fictional products, and starts the built Worker on a free loopback port; it removes that state when done. It uses installed Chrome/Edge (or `npx playwright install chromium` if needed). No existing development or private test database is used. Direct Playwright fixture SQL refuses to run without the isolated runner's database/configuration. Screenshots and traces may contain test factor secrets; keep `test-results` private.

See [the actual validation record](docs/TESTING.md). It distinguishes completed checks from private hosted checks that require Cloudflare access. The current machine reports `You are not authenticated` from `wrangler whoami`; there is no tested hosted preview URL.

## Backup and recovery

Before migrations or operator account maintenance, stop local writes and export a backup outside the repository. Replace `BACKUP_PATH` with an existing protected directory outside your Git checkout:

```sh
npx wrangler d1 export school-supplies-store --local --output BACKUP_PATH/maktabati-backup.sql
```

Copy `.dev.vars` and `.wrangler/state` to a protected backup location while the server is stopped. Preserve the auth secret separately in a secret manager. Never commit those files. To recover, create a **separate** D1 database/binding, import the export with `wrangler d1 execute <recovery-database> --local --file <backup.sql>`, validate counts, foreign keys, inventory, and order totals, then point a test Worker at it before switching the store. An export is a complete database; do not apply initial migrations over imported existing tables. An empty replacement database instead needs all migrations. Keep migration tracking consistent with the restored export. Preserve the previous state until recovery is verified.

For hosted D1, use `--remote` for exports and Cloudflare D1 Time Travel/bookmarks for point-in-time recovery; inspect `npx wrangler d1 time-travel --help` and the account's retention window. Restore to a verified target and reconcile any orders placed after the recovery point before reopening checkout. Do not independently restore orders and inventory: they must come from the same snapshot. Test backup restoration on a separate database before relying on it.

Lost staff authenticator: use a saved one-use recovery code. If all owner factors are lost, a trusted operator must back up D1, revoke that user's sessions, remove their `twoFactor` enrollment, set `twoFactorEnabled=0`, and append an operator audit record using controlled SQL. The owner must enroll and verify a new authenticator before internal access is restored. Do not change or remove the gate, set an MFA proof manually, or make an admin through public APIs. If restoring a backup, revoke recovered sessions before opening access.

## Private hosting and launch schedule

Private hosting prerequisites and commands are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Hosted mode fails closed if Access configuration or a valid signed Access JWT is missing; `run_worker_first: true` protects HTML, assets, SPA paths, and API. A browser-only login redirect is not the security boundary.

The schedule is approval-gated: (1) complete private demo validation with fictional data; (2) after your explicit approval, select a real Iraqi payment provider, implement sandbox payments and verified/idempotent webhooks, and test them; (3) after a separate explicit public-launch approval, configure production inventory/policies, real email delivery, monitoring, backups, and launch access. No public release or live payment integration has been activated or scheduled to run automatically.
