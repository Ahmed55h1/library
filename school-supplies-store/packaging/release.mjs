import { spawnSync } from "node:child_process";
import { releaseEnvironment } from "./config.mjs";
const command = process.argv[2];
const commands = {
  windows: ["build", "--target", "x86_64-pc-windows-msvc", "--bundles", "nsis"],
  "android-init": ["android", "init"],
  android: ["android", "build", "--apk", "--target", "aarch64"],
};
if (!commands[command])
  throw new Error("Choose windows, android-init, or android.");
try {
  const env = releaseEnvironment(process.env);
  const result = spawnSync(
    process.execPath,
    ["node_modules/@tauri-apps/cli/tauri.js", ...commands[command]],
    { env, stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
