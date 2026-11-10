import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
if (!existsSync(".dev.vars"))
  writeFileSync(
    ".dev.vars",
    `APP_ENV="local"\nAPP_ORIGIN="http://127.0.0.1:5173"\nBETTER_AUTH_SECRET="${randomBytes(48).toString("base64url")}"\n`,
  );
console.log("Local secrets ready. Bind development to 127.0.0.1 only.");
