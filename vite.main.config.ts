import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// Remotion packages are pinned to one exact version; record it in spike results.
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies: Record<string, string>;
};

export default defineConfig({
  define: {
    // `ws` can break when bundled by Vite/Rollup if it tries to use its optional native helpers.
    // Keep the bundled version on the pure-JS path so packaging works without manually copying `ws`.
    "process.env.WS_NO_BUFFER_UTIL": JSON.stringify("1"),
    "process.env.WS_NO_UTF_8_VALIDATE": JSON.stringify("1"),
    __REMOTION_VERSION__: JSON.stringify(
      packageJson.dependencies["@remotion/renderer"] ?? "unknown",
    ),
  },
  build: {
    rollupOptions: {
      external: ["@remotion/bundler"],
    },
  },
});
