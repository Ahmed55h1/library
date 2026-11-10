import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";

const root = mkdtempSync(join(tmpdir(), "maktabati-ui-"));
const state = join(root, "state"),
  config = join(root, "wrangler.json");
const port = await new Promise((resolve, reject) => {
  const socket = createServer();
  socket.on("error", reject);
  socket.listen(0, "127.0.0.1", () => {
    const { port } = socket.address();
    socket.close(() => resolve(port));
  });
});
const origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  BASE_URL: origin,
  MAKTABATI_TEST_DB_DIR: state,
  MAKTABATI_TEST_CONFIG: config,
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
};
writeFileSync(
  config,
  JSON.stringify({
    name: "maktabati-isolated-ui",
    main: resolve("dist/school_supplies_store/index.js"),
    no_bundle: true,
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
    compatibility_date: "2026-10-24",
    compatibility_flags: ["nodejs_compat"],
    assets: {
      binding: "ASSETS",
      directory: resolve("dist/client"),
      not_found_handling: "single-page-application",
      run_worker_first: true,
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: "school-supplies-store",
        database_id: "00000000-0000-0000-0000-000000000001",
        migrations_dir: resolve("migrations"),
      },
    ],
    vars: { APP_ENV: "local", APP_ORIGIN: origin },
  }),
);
writeFileSync(
  join(root, ".dev.vars"),
  `BETTER_AUTH_SECRET="${randomBytes(48).toString("base64url")}"\n`,
  { mode: 0o600 },
);
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
const run = (args) => {
  const result = spawnSync(process.execPath, args, {
    env,
    encoding: "utf8",
    timeout: 300_000,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || "Test setup failed");
};
let server,
  output = "";
try {
  run([
    wrangler,
    "d1",
    "migrations",
    "apply",
    "school-supplies-store",
    "--local",
    "--config",
    config,
    "--persist-to",
    state,
  ]);
  run([
    wrangler,
    "d1",
    "execute",
    "school-supplies-store",
    "--local",
    "--config",
    config,
    "--persist-to",
    state,
    "--file",
    "scripts/seed.sql",
  ]);
  server = spawn(
    process.execPath,
    [
      wrangler,
      "dev",
      "--local",
      "--config",
      config,
      "--persist-to",
      state,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (data) => {
    output += data;
  });
  server.stderr.on("data", (data) => {
    output += data;
  });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(output);
    if (
      await fetch(origin + "/api/health")
        .then((r) => r.ok)
        .catch(() => false)
    ) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready)
    throw new Error("Isolated UI Worker did not become ready. " + output);
  console.log(
    "UI tests use a disposable D1 database at a separate loopback origin.",
  );
  const test = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
    { env, stdio: "inherit" },
  );
  process.exitCode = await new Promise((resolve) =>
    test.on("exit", (code) => resolve(code ?? 1)),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.on("exit", resolve));
  }
  // This is a uniquely created temporary directory owned by this process.
  rmSync(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 300,
  });
}
