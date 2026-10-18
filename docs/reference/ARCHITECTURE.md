# Sandwich: Architecture

## 1. Big picture

Think of the app as a restaurant:
- **Renderer process (React UI)** = the dining room. Takes orders (edits recipes), shows previews. Never touches the kitchen equipment directly.
- **Preload bridge** = the order window. A small, typed list of things the dining room is allowed to ask for.
- **Main process** = the kitchen. Owns the files, the database, FFmpeg, and the Remotion renderer.
- **Job queue** = the ticket rail. Long jobs wait their turn and report progress.

```
┌──────────────────────── Renderer (React) ────────────────────────┐
│ Product grid · Caption bank · Editor · Player (@remotion/player) │
└───────────────▲──────────────────────────────┬───────────────────┘
                │ events (job progress)         │ window.api.* (invoke)
┌───────────────┴──────────── Preload ─────────▼───────────────────┐
│ typed API, zod-validated payloads                                │
└───────────────▲──────────────────────────────┬───────────────────┘
┌───────────────┴──────────── Main ────────────▼───────────────────┐
│ IPC handlers → services:                                          │
│   db (better-sqlite3)   jobs (queue)   media (ffmpeg/ffprobe)    │
│   render (@remotion/renderer)   mediaServer (127.0.0.1 HTTP)     │
└───────────────────────────────────────────────────────────────────┘
        │ reads/writes
   Library folder (DB + media + exports)
```

## 2. Processes and responsibilities

### Main (`src/main/`)
- `products/` : `productService.ts` owns product rows plus `products/<id>/image.jpg` (stage in `cache/tmp`, then rename; see DECISIONS #30). `ipc/products.ts` validates with zod and returns `{ ok, ... }` results for user-fixable failures.
- `ipc/` : one file per domain (`products.ts`, `broll.ts`, `captions.ts`, `videos.ts`, `jobs.ts`, `library.ts`). Each handler validates input with zod, calls a service, returns plain JSON.
- `videos/` : `videoService.ts` (draft upsert, list, get, remove; `ipc/videos.ts`). `settings/editorSettingsService.ts` (clip lengths, target range, per-library open-draft pointer; `ipc/settings.ts`). `media/mediaLookup.ts` (media row by id, row + file check by path).
- `library/` : settings.json in `userData` (libraryPath plus the editor fields, DECISIONS #33), folder inspection (sync-folder warning, existing library, schema too new), the library manager (two-phase choose/activate), headless `--db-check`.
- `db/` : connection, migrations runner, repositories. Migrations are `db/migrations/NNN_name.sql`, applied in order inside a transaction, tracked in a `schema_migrations` table.
- `jobs/` : in-process queue. The scheduler is pure (`src/shared/jobScheduler.ts`, unit tested with fake runners); `src/main/jobs/` holds the runners. Job types: `importClip` (probe, normalize, thumbnail, filmstrip, media row; concurrency 2) and `render` (concurrency 1; `exportVideo` in `src/main/render/exportVideo.ts`: render, verify and sidecar in `cache/tmp/<jobId>/`, then move into `exports/`, DECISIONS #37). A job in `cancelling` keeps its pool slot until its runner settles. Every state change and progress tick goes to the renderer on one channel, `job:event` (`{ type: 'queued' | 'started' | 'progress' | 'done' | 'failed' | 'cancelled', job: JobInfo }`); `JobInfo.seq` only grows, so a stale `jobs.list()` snapshot never overwrites a newer event. Progress is throttled, state changes never are. `importClip` builds every output in `cache/tmp/<jobId>/`, renames them into place, and inserts the row last; `sweepLibrary(root)` empties `cache/tmp` and stray `.partial` files when a library is opened by the app (never inside `openLibrary()`). See DECISIONS #29.
- `media/` : `probe.ts`, `normalize.ts`, `thumbs.ts`, `filmstrip.ts`, `binaries.ts` (resolves ffmpeg/ffprobe paths for dev vs packaged, mac vs win).
- `render/` : wraps `selectComposition` + `renderMedia`. Dev uses a dev bundle; packaged uses the prebuilt bundle directory shipped with the app. Passes `binariesDirectory` and `browserExecutable` explicitly in packaged builds.
- `mediaServer.ts` : see section 5.

### Preload (`src/preload/`)
Exposes `window.api` with typed functions only. No generic `invoke(channel, ...)` passthrough. Types are shared from `src/shared/api.ts`.

### Renderer (`src/renderer/`)
- `features/products`, `features/broll`, `features/captions`, `features/editor`, `features/batch`, `features/history`, `features/settings`
- `store/` : Zustand stores. The editor store holds the current Recipe draft.
- Uses `@remotion/player` with the same `<SandwichVideo>` component from `remotion/`. `features/preview/`: `PreviewPanel` (Player, safe-zone toggle, memoized inputProps), `PlayerControls` (play/pause, scrubber, loop; listens to the Player's events), `LengthIndicator`, `previewStore` (seek requests by slot or frame).

### Shared (`src/shared/`)
Pure TypeScript only. No `fs`, no `window`. Everything here is unit tested.
- `recipe.ts` (zod schema + types), `tokens.ts`, `naming.ts`, `slug.ts`, `pairing.ts`, `shuffleBag.ts`, `rng.ts`, `safeZone.ts`, `captionFilter.ts`, `bulkPaste.ts`, `api.ts`, `lengthStatus.ts` (frame-based total and target range), `previewRecipe.ts` (placeholders and missing-clip blanking for the preview)

### Remotion (`remotion/`)
- `index.ts` registers the root
- `Root.tsx` defines `<Composition id="Sandwich" ...>` with `calculateMetadata`, which validates the recipe with zod, returns the parsed recipe in `props`, and derives `durationInFrames` from `buildTimeline` (`src/shared/timeline.ts`). `defaultProps` is an empty recipe with a fixed id and date (deterministic bundle)
- `SandwichVideo.tsx` : three `<Sequence>`s, each a `<ClipLayer>`, plus the debug overlay
- `ClipLayer.tsx` : (editor preview only: draws a placeholder label in a slot without media) cover-fit `<OffthreadVideo>` (falls back to an HTML5 video in the Player, so one component tree serves preview and render; DECISIONS #26), trim via `trimBefore`, zoom via `zoomScale` (`src/shared/zoom.ts`) on `transform: scale()` with `transformOrigin` from `focus`, mute; the caption sits outside the zoom wrapper
- `Caption.tsx` : outline and per-line box styles inside the safe zone; layout from `computeCaptionLayout` (`src/shared/captionLayout.ts`), computed only once the font is ready
- `DebugOverlay.tsx` : `showSafeZone` rectangle and `showTimecode` label (off by default)
- `fonts.ts` : the font is imported as a module (`../assets/fonts/TikTokSans36pt-Bold.ttf`, DECISIONS #34); one module-level `loadFont` promise for the bundled font (no duplicate FontFaces on Player remounts) and `useFontReady()`, which holds a `delayRender` handle and returns whether the font is loaded
- `measureText.ts` : canvas text measurement using exactly the same font shorthand as the drawn text, cached per `(text, size)`

## 3. Library folder layout

```
SandwichLibrary/
  library.db
  products/<productId>/
    image.jpg
    broll/<brollId>.mp4
    broll/<brollId>.jpg            # thumbnail
  clips/<yyyy-mm>/<clipId>.mp4     # normalized UGC clips
  clips/<yyyy-mm>/<clipId>.jpg
  cache/filmstrips/<mediaId>.jpg   # sprite sheet for trim UI
  exports/<productSlug>/<date>/<name>.mp4
  exports/<productSlug>/<date>/<name>.recipe.json
```

All paths in the DB are relative to the library root and use forward slashes; convert with `path.join` at use time. This keeps the library portable between machines and to Windows.

## 4. Database schema (initial)

```sql
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  short_name TEXT,
  slug TEXT NOT NULL UNIQUE,
  image_path TEXT,
  last_used_at TEXT,
  archived_at TEXT,                -- set = hidden from pickers; videos and history are kept
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE media (               -- every normalized file (ugc clips and b-roll)
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('ugc','broll','image')),
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE, -- set for broll
  path TEXT NOT NULL,              -- relative
  thumb_path TEXT,
  filmstrip_path TEXT,
  original_name TEXT,
  duration REAL NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  recorded_at TEXT,                -- from metadata, nullable
  was_hdr INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE captions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('before','after','broll','any')),
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE, -- null = generic
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  status TEXT NOT NULL CHECK (status IN ('draft','exported','failed')),
  recipe_json TEXT NOT NULL,
  export_path TEXT,                -- relative
  batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Deleting a product: a product with videos is **archived** (`archived_at`), never hard deleted (`videos.product_id` has no cascade on purpose). Hard delete is only for a product with zero videos and cascades to its media and captions. Opening a library runs pending migrations after writing `library.db.bak-v<oldVersion>` (newest 3 kept) and checks `PRAGMA foreign_key_check` afterwards (DECISIONS #28).

Later migrations add `creators`, `clip_rights`, `video_stats`, and an `ai_generated` flag on `media`.

## 5. Media server (how the UI and renderer see local files)

Both the Player (in the Electron renderer) and Remotion's headless browser need to load local video by URL. Use one tiny HTTP server in main:

- Binds to `127.0.0.1` only, random free port, started at app launch
- Serves files from the library root only. Rejects path traversal (`..`), absolute paths, and anything outside the root after `path.resolve`.
- Requires a random per-session token in the URL (`/m/<token>/<relative path>`), so other local apps cannot read the library. Details in DECISIONS #25
- Supports HTTP Range requests (206 Partial Content), required for video seeking
- Correct `Content-Type` for mp4, jpg, png, json
- A helper `mediaUrl(base, relPath)` in shared code builds URLs; the base URL is fetched once from main with `library.mediaBaseUrl()`

## 6. Import normalization (FFmpeg)

Every imported clip goes through: probe → decide → transcode → thumbnail → filmstrip.

**Probe** with ffprobe (`-show_streams -show_format -of json`). Extract duration, dimensions, rotation (display matrix side data), fps (avg_frame_rate and r_frame_rate, flag VFR when they differ), color_transfer, pix_fmt, creation time tags.

**HDR detection**: `color_transfer` is `arib-std-b67` (HLG, typical iPhone) or `smpte2084` (PQ).

**Transcode** (output is the "working file" used everywhere):
- Rotation baked in (ffmpeg autorotates by default when transcoding; verify with a rotated fixture)
- Scale so the long edge is at most 1920, keep aspect (cover-fit happens in the composition)
- HDR → SDR tone map. Preferred chain if `zscale` is available:
  `zscale=t=linear:npl=180,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p`
  (`npl=180` was tuned in step 1.2 against an Apple SDR reference, see DECISIONS #24; the original doc value was 100.)
  Check availability at startup (`ffmpeg -hide_banner -filters`). If missing, fall back to a filter the bundled build supports (e.g. `libplacebo` or `colorspace`) and log which path ran. (Step 1.2 deliberately supports zscale only: DECISIONS #23.) Compare visually against the original on a real iPhone HDR clip.
- Constant 30 fps (`-fps_mode cfr -r 30`, or `-vsync cfr` on older builds)
- `-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p`, color tags set to bt709
- Audio: `-c:a aac -ar 48000 -ac 2`. If no audio stream, add silent audio so concatenation and muting behave consistently.
- `-movflags +faststart`

**Thumbnail**: frame at 10% of duration, 360 px wide jpg.
**Filmstrip**: one frame per second (cap 60 frames), tiled sprite, 120 px tall frames, used by the trim UI.

Progress: parse ffmpeg `-progress pipe:1` output for `out_time_ms` and report percent.

## 7. Render pipeline

1. UI asks main to export a Recipe (validated with zod).
2. Main resolves the export name (shared `naming.ts`) and creates the folder.
3. Main converts relative media paths to media server URLs and builds `inputProps`.
4. `selectComposition({ serveUrl: bundleDir, id: 'Sandwich', inputProps })`
5. `renderMedia({ codec: 'h264', composition, serveUrl, inputProps, outputLocation, onProgress, ... })`, implemented by `renderRecipe()` in `src/main/render/render-recipe.ts` (no Electron imports, so the CLI and main share it). Required options: `pixelFormat: 'yuv420p'`, `colorSpace: 'bt709'` (the default converts with BT.601), `audioCodec: 'aac'`, `sampleRate: 48000`, `enforceAudioTrack: true`. The same `inputProps` go to `selectComposition` and `renderMedia`.
   - Software x264 (CRF) is the default; hardware acceleration is not used (DECISIONS #14, #27).
   - Packaged builds: `binariesDirectory` → compositor inside `app.asar.unpacked`, `browserExecutable` → bundled headless browser.
6. Run the verify step (`verifyRender`, `src/main/render/verify.ts`) on the output inside `cache/tmp/<jobId>/`: hard rows (output spec, faststart) fail the export, soft rows (per-clip audio, colour fidelity) become warnings (DECISIONS #38). Write the `.recipe.json` sidecar there too, then move both files into `exports/<slug>/<date>/` without overwriting (name picked right before the move) and, in one transaction, mark the video `exported` and bump caption `use_count` (DECISIONS #37).
7. On failure: remove the tmp dir, mark `failed` (a later save revives the row to a draft), keep the recipe, surface the error with a "Copy details" button. A cancel leaves the draft as it was.

**Bundle**: dev builds the Remotion bundle on startup (or uses a watch build). Packaging runs a script that builds the bundle and copies it into the app resources. `ensureBrowser()` runs at package time and the browser is copied to `app.asar.unpacked`. Follow https://www.remotion.dev/docs/electron and the official Electron template; that page wins if it conflicts with this doc.

**Fallback plan** (only if Step 0.4's spike fails): an FFmpeg-only renderer that builds one filtergraph (trim, scale/crop, zoompan or scale expressions, concat, captions as pre-rendered transparent PNGs drawn with an overlay). The Player preview would then use the same caption PNGs. Record the switch in DECISIONS.md.

## 8. IPC surface (initial)

```ts
library.get() -> LibraryState (unconfigured | ready | error)
library.choose("dialog" | "default") -> LibraryCandidate | null   // inspects a folder, no side effects
library.activate({ useChosenFolder? }) -> LibraryState            // opens the folder main is holding
library.mediaBaseUrl()
products.list({ search? }) / products.create(input) / products.update(id, patch) / products.remove(id) / products.setImage(id, filePath)
broll.list(productId) / broll.import(productId, filePaths[]) -> BrollResult<jobIds> / broll.remove(id) -> BrollResult<true>   // { ok: false } for a missing or archived product
files.pathsFor(File[]) -> string[]         // preload only (webUtils.getPathForFile), no IPC; "" = no path on disk
media.importUgc(filePaths[]) -> jobIds     // mp4/mov/m4v, any letter case
captions.list() -> Caption[] (whole bank, filtered in the renderer) / captions.create(input) / captions.update({ id, patch }) / captions.remove(id) / captions.bulkAdd({ productId, items[] }) -> CaptionResult<...>   // { ok: false, code: invalid | not-found | product-missing }; the renderer parses the paste (validateBulkCaptions) and sends only valid items
videos.saveDraft(recipe) -> VideoResult<{ id, updatedAt }>   // upsert by recipe.id; drafts only; new drafts need a live product
videos.list({ status? }) -> Video[] / videos.get(id) -> Video | null / videos.remove(id) -> VideoResult<true>   // remove is drafts-only; summarize rows with shared/drafts.ts
videos.export(recipe) -> VideoResult<{ jobId }> / videos.reveal(id) -> VideoResult<true>   // saves the draft, queues a render job; reveal resolves the path from the row in main
platform: string                                                         // process.platform, for "Show in Finder" / "Show in Explorer" wording only
settings.get() -> EditorSettings / settings.update({ clipDurations?, targetRange? })   // strict: never libraryPath
settings.getOpenDraft() / settings.setOpenDraft(id | null)              // keyed by the active library root in main
media.get(id) -> Media | null / media.byPaths(paths[]) -> { path, media | null, fileExists }[]
jobs.list() -> JobInfo[] / jobs.cancel(id) -> boolean
events (main -> renderer, one channel): job:event { type: queued | started | progress | done | failed | cancelled, job: JobInfo }
```

## 9. Security

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` where the template allows
- CSP restricting scripts to the app and media to the local media server
- All IPC payloads validated with zod in main
- API keys (later) stored with Electron `safeStorage`, never logged, never in the repo

## 10. Testing strategy

- **Unit (Vitest)**: everything in `src/shared/`, plus repository functions against a temp SQLite DB, plus the media server's path validation.
- **Media integration**: scripts that run normalization on each fixture and assert the output with ffprobe.
- **Render verify**: `scripts/verify-render.ts <file> [expectedSeconds] [--recipe <json>]` asserts 1080x1920, 30 fps, h264 High, yuv420p, Rec.709 colour tags, AAC 48 kHz stereo (hard fail if the audio stream is missing), duration within 0.1 s, `faststart` (moov atom before mdat). With `--recipe`: muted clips are silent, unmuted clips are not silent when their source is audible, and a plain clip's centre patch matches its source frame (colour fidelity).
- **E2E smoke (Playwright Electron)**: launch app, create product, add caption, build a video from fixtures, export, assert file exists.
- **Human checks**: listed per step in BUILD_PROMPTS.md. Video quality bugs are visual; look at the output.

### Fixtures (`npm run fixtures`)
Generated with ffmpeg test sources into `fixtures/` (gitignored):
- `vertical_1080x1920_30.mp4` (with tone audio)
- `horizontal_1920x1080_30.mp4`
- `vertical_60fps.mp4`
- `rotated_90.mp4` (landscape pixels with rotation metadata)
- `no_audio.mp4`
- `short_1s.mp4`
- `still.jpg`
- `hdr_hlg_10bit.mov` if the bundled ffmpeg has libx265, otherwise skip with a message
- `sample.recipe.json` that uses the above

Plus a manual folder `fixtures/real/` (gitignored) where you drop a real iPhone HDR clip, a real screen recording, and a real creator clip.
