import { defineConfig } from "@playwright/test";

// Electron smoke tests (CLAUDE.md: Playwright in Electron mode). They launch the PACKAGED
// app, so run `npm run make` (which maps to `electron-forge package`) first. Not part of
// `npm test`: vitest excludes tests/e2e.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  outputDir: "test-results",
});
