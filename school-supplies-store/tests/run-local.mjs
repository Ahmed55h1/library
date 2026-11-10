import { spawnSync } from "node:child_process";
const uiOnly = process.argv.includes("--ui-only");
for (const args of [
  ...(uiOnly
    ? []
    : [["--test", "--test-concurrency=1", "tests/security.test.mjs"]]),
  [
    "tests/ui-isolated.mjs",
    ...process.argv.slice(2).filter((v) => v !== "--ui-only"),
  ],
]) {
  const r = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    process.exitCode = r.status ?? 1;
    break;
  }
}
