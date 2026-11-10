import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseEnvironment } from "../config.mjs";
test("release URL must be explicitly approved HTTPS; Access origins are exact", () => {
  const valid = {
    MAKTABATI_STORE_URL: "https://store.example.com",
    MAKTABATI_APPROVED_ORIGINS:
      "https://store.example.com,https://team.cloudflareaccess.com",
  };
  assert.equal(
    releaseEnvironment(valid).MAKTABATI_STORE_URL,
    "https://store.example.com/",
  );
  for (const url of [
    "http://store.example.com",
    "https://user:secret@store.example.com",
    "https://store.example.com/api",
    "https://other.example.com",
    "https://*.example.com",
    "https://store.invalid",
    "https://store.example.com/?token=secret",
  ])
    assert.throws(() =>
      releaseEnvironment({ ...valid, MAKTABATI_STORE_URL: url }),
    );
  assert.throws(() => releaseEnvironment({}));
});
