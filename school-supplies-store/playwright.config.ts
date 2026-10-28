import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const channel =
  process.env.PLAYWRIGHT_CHANNEL ||
  (existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe")
    ? "chrome"
    : existsSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe")
      ? "msedge"
      : undefined);

export default defineConfig({
  testDir: "./tests",
  testMatch: "ui.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:5173",
    browserName: "chromium",
    channel,
    headless: true,
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
