# Private release v0.1.0

This separate Tauri **2** layer displays the existing hosted React/Vite store. Hono and D1 continue to run at the same approved HTTPS origin as the frontend. It does not bundle a database, server, credentials, or a second checkout implementation. The Rust app exposes no commands or plugins, has no remote capabilities, denies downloads and desktop popups, and permits navigation only to explicitly approved HTTPS origins. Browser cookies and the existing Better Auth/Access flow remain responsible for authentication.

## Current delivery status

Native packages have **not** been built, signed, installed, or launched in this environment. `tauri info` detects Windows x64, WebView2, and C++ Build Tools, but no Rust compiler, Cargo, or rustup. Direct Windows build and Android initialization both stop at `cargo metadata`: program not found. Java, Android SDK/NDK, adb, and an emulator/device are also unavailable. An approved private deployment URL and Access identity-provider origins have not been supplied. No signing key or certificate is present. The source layer and URL-policy tests can be delivered; an installer or signed APK cannot be honestly delivered from this environment. Rust compilation and dependency resolution are unverified; generate and retain `Cargo.lock` during the first supported native build.

## Prerequisites

- Node 22.12+ or 24, npm; `npm ci` in the store and in `packaging`.
- Rust stable through rustup and the `x86_64-pc-windows-msvc` target; Microsoft C++ Build Tools with Desktop development with C++ and Windows SDK; WebView2 Runtime. C++/WebView2 are already detected on this machine.
- Android Studio/JDK, SDK platform and platform-tools, build-tools, command-line tools, side-by-side NDK. Set `JAVA_HOME`, `ANDROID_HOME`, and `NDK_HOME`; add `%ANDROID_HOME%\platform-tools` to PATH.
- `rustup target add aarch64-linux-android` for the private ARM64 APK. Add `x86_64-linux-android` if testing an x64 emulator.
- An approved, protected private HTTPS deployment, migrations 0001–0003 applied to its **test** D1 database, and working email delivery. Set frontend and API to this one origin. The current hosted Worker requires a configured Cloudflare Access team and audience.

See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), [Windows installers](https://v2.tauri.app/distribute/windows-installer/), and [Android signing](https://v2.tauri.app/distribute/sign/android/).

## Configuration and build

Run in `packaging` after installing prerequisites. Set the following to actual approved origins in the current PowerShell process; these example domains are placeholders and are not approved deployment targets:

```powershell
npm ci
$env:MAKTABATI_STORE_URL = 'https://your-private-store.example.com'
$env:MAKTABATI_APPROVED_ORIGINS = 'https://your-private-store.example.com,https://your-team.cloudflareaccess.com'
# Include the exact HTTPS identity-provider origin(s) when Access redirects there.
npm run check
npm run windows
npm run android:init
npm run android
```

The store URL must be an origin without a path, credentials, query, or fragment; there is no separate API URL. The store origin must appear explicitly in the comma-separated approval list. There are no wildcard approvals. Configuration is compiled into each binary; changing it requires a rebuild. Rust's build script also checks configuration for builds invoked directly through Cargo/Tauri. Do not approve arbitrary domains to work around an Access failure.

`windows` requests an x64 NSIS installer. Expected output after a successful build: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Maktabati_0.1.0_x64-setup.exe` (the bundler may append a locale). Windows Authenticode signing is **not configured**; a private unsigned installer will show publisher/reputation warnings. Supply an organization certificate through an external signing service or Tauri signing configuration if signed Windows distribution is needed; never commit its key.

Android initialization generates the Gradle project in ignored `src-tauri/gen/android`. The ARM64 release build produces an **unsigned** APK under `src-tauri/gen/android/app/build/outputs/apk/universal/release/` until it is signed. Confirm the actual output printed by the installed CLI.

## Private APK signing

Keep the keystore outside this repository, for example in a secured private release directory. Let `keytool` and `apksigner` prompt for passwords; never pass a password on a command line or put it in the source package. Generate the private testing key once and reuse it for updates:

```powershell
keytool -genkeypair -keystore C:\private-release-keys\maktabati-test.jks -storetype JKS -alias private-test -keyalg RSA -keysize 3072 -validity 3650
# Use zipalign/apksigner from the installed Android build-tools directory.
zipalign -p -f 4 <actual-unsigned.apk> <outside-repo-aligned.apk>
apksigner sign --ks C:\private-release-keys\maktabati-test.jks --ks-key-alias private-test --out <private-output>\Maktabati-0.1.0-private.apk <outside-repo-aligned.apk>
apksigner verify --verbose --print-certs <private-output>\Maktabati-0.1.0-private.apk
```

This signs for private testing, not public store distribution. Save the signer certificate fingerprint with the private build record. Never distribute an unsigned APK. No signing operation has occurred in this environment.

## Installation and acceptance on real platforms

On Windows, run the generated `*-setup.exe`, install for the current user, and launch Maktabati from the Start menu. On Android enable installation from the private delivery channel, or connect an authorized test device and run:

```powershell
adb install -r <private-output>\Maktabati-0.1.0-private.apk
adb shell monkey -p com.maktabati.testing -c android.intent.category.LAUNCHER 1
```

On **each installed platform**, record the OS/WebView version, binary SHA256, signer status, and these results: approved/denied Access identities; email verification and recovery; ADMIN username sign-in, first-password change (12+ characters) and TOTP; STAFF/CUSTOMER email sign-in; both Arabic RTL and English LTR; cart persistence and quantity changes; delivery-zone totals and demo confirmation; reopen app and sign out. Check Access/IdP redirects in the actual WebView. Providers that forbid embedded WebViews may require a deployment/identity-provider decision; browser fixture tests do not establish compatibility. Do not weaken the origin or CSRF checks.

Release is private-testing-only. Do not upload binaries, source archives, keys, or test data to a public release or store. Native installation and all live hosted authentication results remain pending the prerequisites above.
