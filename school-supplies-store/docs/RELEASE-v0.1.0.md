# Private v0.1.0 handoff

Branch: `release/maktabati-v0.1.0`, created from `main` (`6ccd80b`) while preserving all existing work. Source changes are committed and pushed separately from application deployment. No application deployment or binary distribution was performed.

## Delivered and pending

- Clean source: `artifacts/maktabati-v0.1.0-source.zip`, with adjacent `.zip.sha256`. Regenerate with `python scripts/package-source.py`. The archive contains source, both npm lockfiles, development setup files, tests, migrations and the Tauri layer. It excludes `.dev.vars`/secrets, databases, signing keys, `.wrangler`, dependencies, builds, Git metadata, and test reports. Archive CRC, source-byte equality, excluded entries and actual local-secret absence were checked.
- Windows `*-setup.exe`: **not produced**. Tauri reports WebView2 157.0.4341.42 and MSVC Build Tools 2026 available, but rustc/Cargo/rustup unavailable. The attempted x64 NSIS build fails at `cargo metadata`: program not found.
- Android signed `.apk`: **not produced**. Android initialization fails at the same missing Cargo prerequisite. Java/JDK, Android SDK/NDK, adb, an emulator/device and a private signing keystore are unavailable. Signing and installation have not occurred.
- Approved private HTTPS origin and Access/identity-provider origins: **not supplied**. Wrangler reports **You are not authenticated**. No hosted Access or wrapper sign-in test was possible. The private wrappers refuse to build without explicit approved HTTPS configuration.

The native source is uncompiled. Native installation/launch, sign-in/Access and storefront acceptance on both platforms remain pending. [Packaging instructions](../packaging/README.md) give prerequisites, configuration, build/signing commands, expected output locations, installation commands and the required platform acceptance record. Distribution is private testing only.

## Account setup

Provisioned one local private test account in the isolated state directory `.wrangler/private-release-v0.1.0`: role `ADMIN`, login `ADMIN`, verified fictional email `admin@maktabati.example.test`, and `passwordChangeRequired=1`. The requested initial password was supplied through the hidden prompt and hashed with Better Auth. It is absent from source/configuration/packages. There is one bootstrap audit entry. A real CLI rerun returned `Administrator already exists; account and password preserved.` with exit code 0.

The initial password remains unchanged for the user's first sign-in. The disposable API/UI fixtures test password replacement and TOTP without consuming that private account's first-sign-in state. A remote test account has not been provisioned because no private remote database/deployment was configured. The local private database and authentication secrets are intentionally excluded from the source archive.

## Actual validation

TypeScript, production build, API regression results and browser results are recorded in [TESTING.md](TESTING.md). The three requested integrity checks are explicitly covered: description-only stale form preserves stock; one quote plus two keys gives one order/deduction; original cookie stays invalid after disable/reactivation. Migration upgrade, first-password change, two-factor verification, permission checks and both languages are also covered in isolated fixtures. Native and live Access checks remain untested for the reasons above.

| Command/check | Actual final result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; React client and Worker bundles produced |
| `npm run test:api` | 21 passed, 0 failed, 0 skipped; 144.16 seconds |
| `npm run test:ui` | 5 passed, 0 failed, 0 skipped; 3.4 minutes |
| `packaging: npm run check` | 1 passed, 0 failed |
| `git diff --check` and changed JS/TS formatting/syntax | Passed |
| Clean source archive | CRC, excluded-entry, source-byte and actual local-secret checks passed |

The final UI run needed execution outside the restricted sandbox after Wrangler's temporary configuration encountered a directory-access denial. It still used a disposable local test database. Test fixtures reset only that database's throttle counters between browser scenarios; production rate limits remain unchanged. Source builds print existing upstream Zod annotation warnings but finish successfully.

## Changed files in this task

Files below are relative to `school-supplies-store`. Pre-existing work was carried into the branch and retained; this list distinguishes the scoped edits from that prior work.

Modified or extended:

- `.gitignore`, `README.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md`
- `package.json`
- `scripts/create-admin.mjs`
- `src/Admin.tsx`, `src/App.tsx`, `src/i18n.ts`, `src/Account.tsx`
- `worker/index.ts`, `worker/auth.ts`
- `tests/run-local.mjs`, `tests/security.test.mjs`, `tests/ui.spec.mjs`

Added:

- `migrations/0003_release_integrity.sql`
- `scripts/package-source.py`, `scripts/test-admin.mjs`, `tests/ui-isolated.mjs`
- `docs/RELEASE-v0.1.0.md`
- `packaging/package.json`, `packaging/package-lock.json`, `packaging/README.md`
- `packaging/config.mjs`, `packaging/release.mjs`, `packaging/tests/config.test.mjs`, `packaging/empty/index.html`
- `packaging/src-tauri/Cargo.toml`, `packaging/src-tauri/build.rs`, `packaging/src-tauri/tauri.conf.json`
- `packaging/src-tauri/src/main.rs`, `packaging/src-tauri/src/lib.rs`
- `packaging/src-tauri/icons/`: PNG/ICO and Android launcher assets generated from the existing store favicon; no redesign

Removed after checking source, tests and configuration references:

- `src/admin.css`
- `src/locales/admin-ar.json`, `src/locales/admin-en.json`, and their registrations
- `tests/api.test.mjs` wrapper; API/e2e commands invoke `tests/security.test.mjs` directly

Also removed the unused language-preference export, Admin store-settings prop/call-site and order-details token prop. Actual store settings, the Account password-recovery token, legacy database tables and migrations 0001/0002 remain.

Other pre-existing changes retained without alteration by this task include `.dev.vars.example`, root `package-lock.json`, `playwright.config.ts`, `wrangler.jsonc`, `scripts/init-local.mjs`, `migrations/0002_identity_and_checkout.sql`, `src/Checkout.tsx`, `src/account.css`, `src/styles.css`, and the main Arabic/English locale files.
