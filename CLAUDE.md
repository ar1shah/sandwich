# Sandwich: TikTok Shop UGC Auto-Editor

Desktop app that turns raw UGC clips into finished 9:16 TikTok Shop videos using one fixed 3-slot template:

1. **Before** clip (UGC, different every video)
2. **After** clip (UGC, different every video)
3. **B-roll** clip (product footage, reused across videos, picked from a per-product library)

Each slot gets: trim, optional zoom, optional caption, mute toggle. Music is NOT handled here (it gets added later in the TikTok app).

Full details live in `docs/`. Read the relevant doc before starting a task:
- `docs/SPEC.md` : features, user flows, data model, recipe schema, naming rules
- `docs/ARCHITECTURE.md` : processes, IPC, render pipeline, media server, folder layout
- `docs/ROADMAP.md` : phases and exit criteria
- `docs/CHECKLIST.md` : current progress (source of truth for what is done)
- `docs/BUILD_PROMPTS.md` : the step-by-step build plan
- `docs/DECISIONS.md` : decision log (append when you make a non-obvious choice)

## Stack

- **Shell:** Electron, based on the official Remotion Electron template (Electron Forge + Vite)
- **UI:** React + TypeScript (strict) + Tailwind, Zustand for state
- **Preview:** `@remotion/player` in the renderer process
- **Render:** `@remotion/renderer` (`selectComposition` + `renderMedia`) in the MAIN process only, using a Remotion bundle built at package time (never call `bundle()` at runtime in a packaged app)
- **Media tools:** FFmpeg + FFprobe binaries bundled with the app (probe, normalize, thumbnails, filmstrips)
- **Data:** SQLite via `better-sqlite3` with numbered SQL migrations
- **Validation:** `zod` for the recipe schema and every IPC payload
- **Tests:** Vitest for logic, Playwright (Electron mode) for smoke E2E

All Remotion packages must be pinned to the exact same version with no `^`.

## Golden rules

1. **The recipe is the product.** Every video is a `Recipe` JSON (see `docs/SPEC.md`). The UI only edits recipes. The renderer only reads recipes. UI state and render logic never diverge.
2. **Preview must equal export.** The same `<SandwichVideo>` composition is used by the Player and by `renderMedia`. No separate preview-only drawing code for captions, zoom, or crop.
3. **Cross-platform from day one.** The app must build on Windows later without rewrites:
   - Use `path.join` / `path.resolve`, never string-concatenated paths or hardcoded `/`
   - Spawn binaries with argument arrays (`spawn(bin, [...args])`), never shell strings
   - No macOS-only APIs without a Windows fallback
   - Store media paths in the DB **relative to the library root**
4. **Main process owns the filesystem, FFmpeg, SQLite, and rendering.** The renderer talks to main only through the typed preload API (`window.api`). `contextIsolation: true`, `nodeIntegration: false`.
5. **Never block the main process.** Long work (normalize, thumbnails, render) runs through the job queue with progress events.
6. **Never modify or delete a user's original files.** Imports are copied and normalized into the library folder.
7. **Binaries are never loaded from inside `app.asar`.** FFmpeg, FFprobe, the Remotion compositor, and the headless browser live in `app.asar.unpacked` in packaged builds, with explicit paths passed in (`binariesDirectory`, `browserExecutable`).

## Video output spec (do not change without a DECISIONS.md entry)

- 1080x1920, 9:16, 30 fps constant
- H.264 (High), `yuv420p`, AAC 48 kHz stereo, `+faststart`
- SDR Rec.709 only. HDR (HLG / PQ) inputs are tone mapped on import.
- Captions must stay inside the safe zone defined in `src/shared/safeZone.ts`

## Folder layout (code)

```
src/
  main/          # Electron main: IPC handlers, db, jobs, ffmpeg, render, media server
  preload/       # typed bridge exposing window.api
  renderer/      # React UI (features in src/renderer/features/<feature>/)
  shared/        # types, zod schemas, pure logic (tokens, naming, pairing). No Node or DOM imports.
remotion/        # Remotion entry + <SandwichVideo> composition
scripts/         # dev scripts: fixtures, render CLI, verify
tests/           # vitest + playwright
fixtures/        # generated test media (gitignored except the generator)
docs/
```

If the Remotion Electron template uses a different layout, keep its layout for the shell and map these folders onto it. Record the mapping in `docs/DECISIONS.md`.

## Commands

Keep this list accurate as scripts get added:

```
npm run dev            # start app in dev mode
npm test               # vitest
npm run lint           # eslint + tsc --noEmit
npm run fixtures       # generate test media into fixtures/
npm run render:sample  # render fixtures/sample.recipe.json to out/
npm run verify:render  # ffprobe asserts on a rendered file
npm run make           # package the app
```

## How to work in this repo

- Work on ONE step from `docs/BUILD_PROMPTS.md` at a time. Do not start the next step unprompted.
- Before coding a step: read the step and the docs it references, then propose a short plan.
- After coding a step: run `npm run lint` and `npm test`, run that step's checks, then report results honestly, including anything that failed or was skipped.
- When a step's checks pass: tick it in `docs/CHECKLIST.md` and suggest a commit message. Never tick boxes for checks that did not actually run.
- Pure logic goes in `src/shared/` with unit tests. If a function has no side effects, it gets a test.
- If you deviate from the spec or choose between tradeoffs, add an entry to `docs/DECISIONS.md`.
- If a doc is wrong or outdated (library APIs change), say so and propose a doc fix instead of silently working around it.
- Prefer the official docs for Remotion, Electron Forge, and FFmpeg over memory. These APIs move fast.
- Keep components small and feature-foldered.
- No em dashes in UI copy.

## Licensing notes

- Remotion is free for individuals and for-profit companies with fewer than 4 people involved in the project (combined headcount when collaborating). Recheck https://www.remotion.dev/license before scaling or selling.
- FFmpeg static builds may be GPL. Fine for internal use. Revisit before distributing commercially.
