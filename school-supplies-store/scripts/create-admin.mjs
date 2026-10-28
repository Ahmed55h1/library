import { randomBytes, pbkdf2Sync } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { writeFileSync, mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
if (args.includes("--help")) {
  console.log(
    "node scripts/create-admin.mjs --email owner@example.com [--password-env VARIABLE] [--remote]",
  );
  process.exit(0);
}
let email = option("--email");
if (!email) {
  const input = createInterface({ input: stdin, output: stdout });
  email = await input.question("Administrator email / البريد الإلكتروني: ");
  input.close();
}
email = email.trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
  throw new Error("A valid email address is required.");
let password;
const passwordEnv = option("--password-env");
if (passwordEnv) {
  password = process.env[passwordEnv];
  if (!password)
    throw new Error(`Environment variable ${passwordEnv} is empty.`);
} else {
  if (!stdin.isTTY)
    throw new Error(
      "Use an interactive terminal or --password-env VARIABLE. Passwords must not be passed as command arguments.",
    );
  async function hidden(prompt) {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    return new Promise((resolve, reject) => {
      let value = "";
      const listener = (chunk) => {
        for (const character of chunk) {
          if (character === "\u0003") {
            cleanup();
            reject(new Error("Cancelled"));
            return;
          }
          if (character === "\r" || character === "\n") {
            cleanup();
            stdout.write("\n");
            resolve(value);
            return;
          }
          if (character === "\u007f" || character === "\b") {
            value = value.slice(0, -1);
            continue;
          }
          if (character >= " ") value += character;
        }
      };
      function cleanup() {
        stdin.off("data", listener);
        stdin.setRawMode(false);
        stdin.pause();
      }
      stdin.on("data", listener);
    });
  }
  password = await hidden("Password (12+ characters) / كلمة المرور: ");
  const confirm = await hidden("Confirm password / تأكيد كلمة المرور: ");
  if (password !== confirm) throw new Error("Passwords do not match.");
}
if (password.length < 12 || password.length > 1024)
  throw new Error("Password must have 12–1024 characters.");
const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(
  password,
  Buffer.from(salt, "hex"),
  100000,
  32,
  "sha256",
).toString("hex");
password = undefined;
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
const sql = `INSERT INTO administrators(email,password_hash,password_salt,password_iterations) VALUES(${quote(email)},${quote(hash)},${quote(salt)},100000);\n`;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "maktabati-admin-"));
const filename = join(temporary, "create.sql");
try {
  writeFileSync(filename, sql, { mode: 0o600 });
  const result = spawnSync(
    process.execPath,
    [
      join(root, "node_modules", "wrangler", "bin", "wrangler.js"),
      "d1",
      "execute",
      "DB",
      args.includes("--remote") ? "--remote" : "--local",
      "--file",
      filename,
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  if (result.status !== 0) process.exitCode = result.status || 1;
  else
    console.log(
      `Administrator created: ${email}. Sign in at /admin. / تم إنشاء حساب المدير.`,
    );
} finally {
  rmSync(filename, { force: true });
  rmdirSync(temporary);
}
