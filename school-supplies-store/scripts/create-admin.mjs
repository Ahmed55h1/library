import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "better-auth/crypto";
import { hiddenPassword, testAdminSql } from "./test-admin.mjs";
const args = process.argv.slice(2),
  email = args[args.indexOf("--email") + 1];
const option = (key) =>
  args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const testSetup = args.includes("--test-setup");
if (testSetup && (args.includes("--remote") || !option("--persist-to")))
  throw new Error(
    "Test setup requires an explicit isolated local --persist-to path and forbids --remote.",
  );
if (
  !args.includes("--email") ||
  !email ||
  !/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)
)
  throw new Error(
    "Usage: npm run admin:create -- --email verified-owner@example.test [--remote]",
  );
const dir = mkdtempSync(join(tmpdir(), "maktabati-bootstrap-")),
  file = join(dir, "bootstrap.sql");
try {
  const execute = (sql) => {
    writeFileSync(file, sql, { mode: 0o600 });
    const childEnv = { ...process.env, WRANGLER_WRITE_LOGS: "false" };
    delete childEnv.MAKTABATI_TEST_ADMIN_PASSWORD;
    const r = spawnSync(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "d1",
        "execute",
        "school-supplies-store",
        args.includes("--remote") ? "--remote" : "--local",
        "--file",
        file,
        "--json",
        ...(option("--persist-to")
          ? ["--persist-to", option("--persist-to")]
          : []),
        ...(option("--config") ? ["--config", option("--config")] : []),
      ],
      { encoding: "utf8", env: childEnv },
    );
    if (r.status !== 0)
      throw new Error(
        "Admin database operation failed; check the selected database and migrations.",
      );
    return JSON.parse(r.stdout);
  };
  const existing = execute("SELECT id FROM user WHERE role='ADMIN';");
  if (existing.some((r) => r.results?.length)) {
    console.log(
      "Administrator already exists; account and password preserved.",
    );
  } else if (testSetup) {
    let password = await hiddenPassword();
    if (password.length < 11 || password.length > 128)
      throw new Error(
        "Initial test password must be 11–128 characters; normal passwords require at least 12.",
      );
    const encoded = await hashPassword(password);
    password = "";
    const results = execute(testAdminSql(email.toLowerCase(), encoded));
    if (!results.some((r) => r.results?.some((u) => u.loginName === "ADMIN")))
      throw new Error(
        "Existing account preserved; no new test administrator was created.",
      );
    console.log(
      "One-time private test administrator provisioned. Password change and two-factor verification are required.",
    );
  } else {
    const results = execute(
      `UPDATE user SET role='ADMIN',updatedAt=unixepoch()*1000 WHERE email='${email.toLowerCase()}' AND emailVerified=1 AND NOT EXISTS(SELECT 1 FROM user WHERE role='ADMIN');\nINSERT INTO audit_log(actor_id,action,entity,entity_id,details) SELECT 'bootstrap-cli','admin.bootstrap','user',id,'{}' FROM user WHERE email='${email.toLowerCase()}' AND role='ADMIN' AND changes()=1;\nSELECT id,email,role FROM user WHERE email='${email.toLowerCase()}' AND role='ADMIN';`,
    );
    if (!results.some((r) => r.results?.length))
      throw new Error("Register and verify the owner email first.");
    console.log(
      "Verified owner promoted. Enroll and verify two-factor authentication.",
    );
  }
} finally {
  rmSync(file);
  rmdirSync(dir);
}
