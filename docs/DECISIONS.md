# Sandwich: Decision Log

Append-only. One entry per non-obvious choice. Newest at the bottom.

Format:
```
## #N YYYY-MM-DD: Title
**Context:** what problem / options
**Decision:** what we picked
**Why:** the reasoning
**Revisit if:** what would make us change it
```

---

## #1 2026-10-15: Desktop app, not web app
**Context:** Web app would need uploads to a server or in-browser rendering.
**Decision:** Electron desktop app, everything local.
**Why:** Video files are large; local disk + local encoding is faster and free. Same codebase builds for Windows.
**Revisit if:** We need non-technical team members on other machines, or rendering moves to the cloud.

## #2 2026-10-15: Remotion for preview + render
**Context:** Options were Remotion (React compositions) or a pure FFmpeg filtergraph renderer.
**Decision:** Remotion, with `@remotion/player` for preview and `@remotion/renderer` in the Electron main process.
**Why:** One React component for both preview and export means what you see is what you get; captions are just CSS. Remotion has an official Electron template and docs for packaged rendering.
**Revisit if:** Step 0.4 spike fails, renders are too slow for batch mode, or the team grows to 4+ people involved (license cost).

## #3 2026-10-15: Normalize every clip on import
**Context:** UGC arrives as HDR HEVC, rotated, VFR, horizontal, 60 fps.
**Decision:** Transcode every import to SDR H.264, 30 fps CFR, rotation baked, long edge max 1920.
**Why:** One predictable input format removes a whole class of washed-out color, sync, and seeking bugs, and makes preview fast.
**Revisit if:** Import time becomes a bottleneck (consider hardware encoding).

## #4 2026-10-15: Recipe JSON as the single source of truth
**Context:** Need reopen/edit, batch, and future sharing.
**Decision:** Every video is a versioned, zod-validated Recipe; exports write a `.recipe.json` sidecar.
**Why:** Re-rendering and editing old videos is free; batch mode is just generating many recipes.
**Revisit if:** Never, really. Bump `schemaVersion` and migrate when the shape changes.

## #5 2026-10-15: Local SQLite now, Supabase for sharing later
**Context:** Two users on separate Macs.
**Decision:** v1 is single-machine SQLite in a user-chosen library folder. Sharing (Phase 5) uses Supabase for metadata and a shared drive for media only.
**Why:** SQLite files corrupt in Dropbox/Drive sync. Metadata is tiny; media is huge. Split them.
**Revisit if:** Sharing becomes urgent before Phase 5.

## #6 2026-10-15: Map our folder layout onto the Remotion Electron template
**Context:** The official template (remotion-dev/template-electron) is flat: `src/main.ts`, `src/preload.ts`, `src/renderer.ts`, `src/App.tsx`, plus `src/render-video.ts` and friends. `CLAUDE.md` wants `src/{main,preload,renderer,shared}`.
**Decision:** Keep the template's tooling and config files at the repo root (`forge.config.ts`, `vite.*.config.ts`, `index.html`, `remotion/`) and move only the source files:
- `src/main.ts` → `src/main/main.ts`
- `src/preload.ts` → `src/preload/preload.ts`
- `src/renderer.ts`, `src/App.tsx`, `src/index.css` → `src/renderer/`
- `src/render-video.ts`, `remotion-bundle.ts`, `packaged-browser.ts`, `compositor-package.ts` → `src/main/render/`
- `src/integration-render-test-mode.ts` → `src/main/`
- IPC channel names and the `SandwichApi` type → `src/shared/ipc.ts`
The only config changes are the entry paths in `forge.config.ts` and the script path in `index.html`. Entry files keep the basenames `main.ts` and `preload.ts` because the Forge Vite plugin names its output after the entry file, and `package.json#main` points at `.vite/build/main.js`.
**Why:** Matches the documented layout without touching the packaging logic the template already solves.
**Revisit if:** A template upgrade moves files again.

## #7 2026-10-15: Scaffold dependency choices
**Context:** Template pins and a few conflicts found while installing.
**Decision:**
- All `remotion` and `@remotion/*` packages (including compositor optional deps and `@remotion/eslint-config-flat`) pinned to `4.0.535`, no `^`.
- `@types/node` raised from the template's 20.x to 22.x because Vitest 5 requires `^22 || >=24`.
- Tailwind 4 (template's `@tailwindcss/postcss`) kept as is.
- The template's render IPC handlers and demo UI were removed. The render modules in `src/main/render/` are kept (still wired into `forge.config.ts` for bundle and compositor staging) so Step 0.4 can build on them. `window.api` exposes only `app.version()` for now.
- `npm run make` runs `electron-forge package` until real makers are configured (Step 0.4 / 5.1).
- `sandbox: true` is enabled on the main window; the preload is a single Vite-bundled file, so this works.
**Why:** Keep the template's proven packaging path, minimal surface in the scaffold.
**Revisit if:** Step 0.4 needs the template's render IPC back, or Forge makers are added.
