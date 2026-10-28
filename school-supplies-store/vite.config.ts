import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      // Generated browser reports can be locked briefly by Chrome on Windows.
      ignored: [
        "**/test-results/**",
        "**/playwright-report/**",
        "**/.wrangler/**",
        "**/dist/**",
        "**/*.md",
        "**/docs/**",
        "**/tests/**",
        "**/playwright.config.*",
      ],
    },
  },
});
