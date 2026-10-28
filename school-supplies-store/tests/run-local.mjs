import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const email = `qa-${randomUUID()}@local.invalid`;
const environment = {
  ...process.env,
  TEST_ADMIN_EMAIL: email,
  TEST_ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
  WRANGLER_SEND_METRICS: "false",
};
function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
let created = false;
try {
  const health = await fetch(
    `${environment.BASE_URL || "http://localhost:5173"}/api/health`,
  );
  if (!health.ok)
    throw new Error(
      "Start npm run dev and initialize local D1 before verification.",
    );
  if (
    run([
      "scripts/create-admin.mjs",
      "--email",
      email,
      "--password-env",
      "TEST_ADMIN_PASSWORD",
    ])
  )
    throw new Error("Temporary administrator creation failed.");
  created = true;
  const apiExit = process.argv.includes("--ui-only")
    ? 0
    : run(["--test", "--test-concurrency=1", "tests/api.test.mjs"]);
  const grepIndex = process.argv.indexOf("--grep");
  const uiExit = run([
    "node_modules/@playwright/test/cli.js",
    "test",
    ...(grepIndex >= 0 ? ["--grep", process.argv[grepIndex + 1]] : []),
  ]);
  process.exitCode = apiExit || uiExit;
} finally {
  if (created) {
    const cleanupExit = run([
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      `UPDATE images SET admin_id=NULL WHERE admin_id=(SELECT id FROM administrators WHERE email='${email}'); DELETE FROM administrators WHERE email='${email}';`,
    ]);
    if (cleanupExit) {
      console.error(
        `Remove the temporary local QA account ${email} before sharing the database.`,
      );
      process.exitCode = 1;
    }
  }
  environment.TEST_ADMIN_PASSWORD = "";
}
