# Actual validation record

Validated locally on 2026-11-10 (Asia/Baghdad), Windows 10, Node.js v24.22.0 and npm 11.19.1. Application origin: `http://127.0.0.1:5173`.

| Check | Observed result |
| --- | --- |
| Local migration `0002_identity_and_checkout.sql` | Passed: 24 commands applied successfully by Wrangler; existing catalog retained |
| Migration `0003_release_integrity.sql` | Applied to the isolated private database; upgrade fixture preserves duplicate historical orders and permanently claims their quote |
| TypeScript and Vite production build | Passed: frontend and Worker output generated |
| `npm run test:api` | **21 passed, 0 failed, 0 skipped**; final run took 144.16 seconds |
| `npm run test:ui` | **5 passed, 0 failed, 0 skipped**, 3.4 minutes; final run used an isolated D1/Worker on a free loopback port |
| `packaging: npm run check` | **1 passed, 0 failed**; approved HTTPS origin policy |
| One-time private ADMIN setup | Provisioned in `.wrangler/private-release-v0.1.0`; role/login ADMIN, verified fictional email, password-change flag set; one bootstrap audit entry; rerun preserved account/password |
| Windows native build / Android initialization | Both stop at `cargo metadata`: program not found. No installer/APK generated; no native install/launch tests performed |
| Local health and seed data | `/api/health` returned D1 / Better Auth / demo; 12 sample products present |
| Screenshot inspection | Arabic desktop storefront, English phone storefront, phone quote review, and admin layouts inspected; corrected development CSP, language preference race, offscreen skip-link artifact, and permission editor save timing |
| Cloudflare account access | `wrangler whoami`: **You are not authenticated** |
| Live Cloudflare Access allowlist tests | Not run: no authorized Cloudflare deployment/account/allowlist available |
| Tested private preview URL | None; no public or private remote deployment was made |

## API coverage

The suite loads every module of the real Vite-built Worker in Miniflare/workerd with native D1 and applies migrations 0001–0003 to new, isolated databases. Tests use actual Better Auth registration, verification messages, sign-in cookies, authenticator enrollment, TOTP verification, one-use backup codes, and password recovery. Trusted fixture code can seed/inspect its own disposable D1 database; there is no production test-login endpoint.

1. Anonymous and customer direct requests cannot access internal routes.
2. Public registration/profile edits reject injected roles, permissions, verification, and factor fields.
3. Staff promotion starts empty; password-only and unverified-factor sessions fail.
4. Price-only permission allows price edits, rejects stock/description/category edits, and revocation/demotion applies during the same session.
5. Injected prices, fees, totals, and unexpected checkout fields are rejected.
6. Identical confirmations return one customer-owned order; changed payloads conflict; another customer cannot read the order even with its confirmation key; purchase-time snapshots remain unchanged.
7. Product price or zone fee changes after review reject confirmation and leave inventory/order count unchanged.
8. Two simultaneous buyers of the last unit produce exactly one order and zero remaining stock.
9. Simultaneous identical confirmations reserve stock once and return the same order.
10. A later failing item rolls back earlier stock reservations and the complete order.
11. Invalid status jumps, reopening canceled orders, and post-dispatch cancellation fail; concurrent pre-dispatch cancellation restores stock once; valid dispatch/delivery transitions succeed.
12. Two-factor bypass, forged cookies, and reused backup codes fail.
13. CSRF, unknown update fields, persisted recovery throttles, HttpOnly/SameSite cookies, actor/timestamp audit records, and immutable audit triggers are checked.
14. Unverified email sign-in fails; password recovery works and invalidates previous sessions.
15. Category/description/stock/order-read/order-update grants are independent; disablement applies immediately; an enrollment flag without a session proof does not grant access.
16. A separate hosted-mode Worker fixture verifies Access signatures/audiences via an isolated JWKS, denies missing/forged/wrong-audience tokens for frontend and API paths, permits a valid fixture JWT, blocks the local mailbox, and sets Secure/HttpOnly/SameSite cookies and HSTS.
17. Concurrent confirmations of the same quote with different keys return one order and deduct stock once; retries after expiry succeed, while conflicting shipping and another customer fail.
18. A stale description update preserves current stock; a stale stock value or missing stock precondition is rejected.
19. Admin order summaries expose exactly the displayed fields; details expose phone/address only under the existing read permission and omit internal hashes/keys.
20. An upgrade fixture creates duplicate historical orders before migration 0003, preserves both during migration, and prevents quote reuse. Test bootstrap creates one hashed ADMIN and preserves its password on rerun.
21. ADMIN alias sign-in uses Better Auth, accepts the initial test password, blocks dashboard access until password change, rejects a short replacement, and still requires a per-session factor proof afterward. The disable/reactivation scenario replays a saved original session cookie and expects 401.

The hosted-mode fixture establishes application behavior only. It does **not** prove a real Cloudflare Access policy is configured or that real approved/unapproved accounts have been exercised.

## Browser coverage

Playwright used the installed Chromium-family browser and real local Worker/API/D1. Each language's `html[lang]` and `dir` are asserted, and desktop/phone screenshots are captured with horizontal overflow checks.

- Catalog browsing, Arabic and English search, product details, add-to-cart, quantity edits, and cart persistence.
- A verified customer signing in, entering fictional delivery details, reviewing server-calculated totals, explicitly confirming a demo order, and viewing/tracking their own order in both languages.
- An admin signing in, enrolling/verifying an authenticator, browsing the workspace in both languages and sizes, creating/hiding/reordering/deleting a fictional category, opening accounts and audit pages, promoting a new staff member with empty grants, then granting/revoking a separate permission and disabling the fixture account.
- A stale product form sends only its changed description and preserves a concurrent stock edit. A subsequent stock edit sends its original stock precondition and is rejected after a second concurrent stock change.
- ADMIN username sign-in with an 11-character fixture password, mandatory replacement, authenticator enrollment/verification, dashboard access, sign-out, and staff email sign-in. All fixture passwords differ from the real private test account secret.

Generated evidence is in ignored `test-results/` and `playwright-report/`. Traces can contain fictional credentials and factor enrollment secrets; keep them private. The runner creates a temporary Wrangler configuration, random auth secret, seeded D1 database, and built Worker on a free loopback port. Fixture SQL requires that runner's configuration/state. The database and server are removed after the suite; neither the development database nor the persistent private ADMIN database is touched.

## Reproduce

```sh
npm ci
npm run init:local
npm run build
npm run test:api
npm run test:ui
```

Both suites require a current build and manage isolated test databases themselves. `npm run test:e2e` runs both original suites directly. No CI configuration references the removed `tests/api.test.mjs` wrapper. See README for admin setup, [the release handoff](RELEASE-v0.1.0.md), and [native build prerequisites](../packaging/README.md). Browser and signed-JWT fixture results do not establish native WebView or live Cloudflare Access compatibility.
