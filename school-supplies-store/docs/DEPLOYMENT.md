# Private Cloudflare demo deployment

No private preview was deployed during this handoff. `npx wrangler whoami` reported **You are not authenticated**. Required: an authorized Cloudflare account with Workers/D1 and Zero Trust Access permissions, a selected demo hostname, an explicit approved-email/group allowlist, and a verified mail sender/API key. There is no tested preview URL, and real approved/unapproved account tests remain pending.

## Configure before publishing

1. Sign in using `npx wrangler login` in your own interactive terminal. Run `npx wrangler whoami` and confirm the intended account.
2. Create a dedicated fictional-data D1 database with `npx wrangler d1 create school-supplies-store`. Replace the placeholder `database_id` in `wrangler.jsonc` with the returned ID. Keep local and remote databases separate.
3. Choose an HTTPS hostname. Configure a Cloudflare Access self-hosted application covering **every path** of that hostname, with an Allow policy limited to explicitly approved accounts/groups and the default deny policy for everyone else. Do not add a Bypass or Everyone policy. Enable Access protection on the Worker hostname as appropriate. Record the Access application AUD and your team's `https://<team>.cloudflareaccess.com` issuer.
4. Keep `APP_ENV=demo` in Wrangler. Set `APP_ORIGIN` to the exact HTTPS origin. Add `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` as environment variables or secrets. Set `BETTER_AUTH_SECRET` using `npx wrangler secret put BETTER_AUTH_SECRET` with a fresh random secret (at least 32 characters). Set `MAIL_API_KEY` and `MAIL_FROM` with `wrangler secret put` for a verified Resend sender. Keep secrets out of Git, command arguments, README files, and deployment logs.
5. Apply migrations using `npx wrangler d1 migrations apply school-supplies-store --remote`, including `0003_release_integrity.sql`. It preserves previous orders and permanently claims previously consumed quotes, including duplicate historical orders; it also adds session revocation and the first-password-change fields. Keep all previous migrations and the legacy `administrators`, `sessions`, and `images` tables. Seed the dedicated demo database with `npx wrangler d1 execute school-supplies-store --remote --file scripts/seed.sql` once. All data must remain fictional.
6. Run `npm run build`, `npm run test:api`, and the documented local UI tests. Deploy with `npx wrangler deploy` from this project (the Vite build emits `.wrangler/deploy/config.json` identifying the Worker output). Preserve `run_worker_first: true`. Do not use a static Pages deployment, which would omit the application Access check.
7. Verify the deployment URL belongs to the intended protected application. Register and verify the owner's bookstore account, then use `npm run admin:create -- --email <verified-owner> --remote`. Enroll and verify an authenticator before internal functions become available.

## Verify actual Access behavior

Use separate browser profiles for an approved account and an unapproved account, plus a signed-out profile. For the actual deployment, record timestamp, hostname, and test account identifiers privately:

- Approved Access account can load `/`, `/shop`, static JavaScript/images, and `/api/store`. Bookstore authentication is still required for checkout/orders. Admin/staff functions still require their current role, grant, and per-session factor proof.
- Unapproved and signed-out accounts cannot load the frontend, assets, SPA routes, or API. Verify direct requests to `/api/store`, `/api/orders`, and `/api/admin/data`, not just navigation links. No customer information may appear in denied responses.
- Requests that bypass the Access edge or use an alternate Worker/preview hostname must still fail inside the Worker unless they carry a valid Access JWT for the configured issuer and audience. The app verifies its signature against the team's JWKS. A made-up header, wrong issuer/audience, or expired token is rejected.
- Inspect bookstore session cookies over HTTPS for Secure, HttpOnly, SameSite=Strict; confirm CSRF rejection and rate limits. Check the live UI in both languages on phone and desktop.
- Copy the **tested** private HTTPS preview URL into the handoff only after these live account checks pass. Local JWT fixtures test the application's boundary but cannot establish that the real Access policy/hostname/identity provider is configured correctly.

Hosted mode fails closed with `ACCESS_NOT_CONFIGURED`, `ACCESS_DENIED`, or `HTTPS_REQUIRED` before serving assets/API. The local demo mailbox and local HTTP behavior are unavailable when hosted. Production `.dev.vars` files are not deployment secrets; use Cloudflare environment secrets. Never deploy with `APP_ENV=local`.

## Private Windows and Android release

Use the separate [Tauri 2 layer](../packaging/README.md). Supply the approved store origin and the exact Access/identity-provider origins at build time. Both frontend and API must stay at the store origin; the wrapper has no native API grants and carries no credentials. Live Access/sign-in tests and native installation are mandatory before distributing a build privately. They remain unverified until the documented environment and deployment prerequisites are available.

## Live payment and public release

Both remain awaiting the owner's explicit approval. After approval, select an Iraqi/IQD-compatible merchant provider, implement sandbox checkout and signed/replay-safe webhooks, test duplicate/delayed/failed payment events and refunds, and complete a separate production-readiness review. Request a separate public-launch approval before changing Access policies or enabling real transactions. Do not remove the Worker gate as an incidental deployment change.

## Database recovery

Export remote D1 before migrations with `npx wrangler d1 export school-supplies-store --remote --output <protected-backup.sql>`. Use D1 Time Travel/bookmarks or import the export to a separate recovery database, verify it, and switch the binding during a maintenance window. Preserve the auth encryption secret, revoke restored sessions, and reconcile orders/inventory from the same point in time. See the README for local recovery and lost-factor recovery.
