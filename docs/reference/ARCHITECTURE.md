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
- `ipc/` : one file per domain (`products.ts`, `broll.ts`, `captions.ts`, `videos.ts`, `jobs.ts`, `library.ts`). Each handler validates input with zod, calls a service, returns plain JSON.
- `db/` : connection, migrations runner, repositories. Migrations are `db/migrations/NNN_name.sql`, applied in order inside a transaction, tracked in a `schema_migrations` table.
- `jobs/` : in-process queue. Job types: `normalize`, `thumbnail`, `filmstrip`, `render`. Concurrency: 2 for normalize/thumbnail, 1 for render. Emits `job:progress`, `job:done`, `job:failed` to the renderer. Jobs are cancelable.
- `media/` : `probe.ts`, `normalize.ts`, `thumbs.ts`, `filmstrip.ts`, `binaries.ts` (resolves ffmpeg/ffprobe paths for dev vs packaged, mac vs win).
- `render/` : wraps `selectComposition` + `renderMedia`. Dev uses a dev bundle; packaged uses the prebuilt bundle directory shipped with the app. Passes `binariesDirectory` and `browserExecutable` explicitly in packaged builds.
- `mediaServer.ts` : see section 5.

### Preload (`src/preload/`)
Exposes `window.api` with typed functions only. No generic `invoke(channel, ...)` passthrough. Types are shared from `src/shared/api.ts`.

### Renderer (`src/renderer/`)
- `features/products`, `features/broll`, `features/captions`, `features/editor`, `features/batch`, `features/history`, `features/settings`
- `store/` : Zustand stores. The editor store holds the current Recipe draft.
- Uses `@remotion/player` with the same `<SandwichVideo>` component from `remotion/`.

### Shared (`src/shared/`)
Pure TypeScript only. No `fs`, no `window`. Everything here is unit tested.
- `recipe.ts` (zod schema + types), `tokens.ts`, `naming.ts`, `slug.ts`, `pairing.ts`, `shuffleBag.ts`, `rng.ts`, `safeZone.ts`, `captionFilter.ts`, `bulkPaste.ts`, `api.ts`

### Remotion (`remotion/`)
- `index.ts` registers the root
- `Root.tsx` defines `<Composition id="Sandwich" ...>` with `calculateMetadata` deriving `durationInFrames` from the recipe
- `SandwichVideo.tsx` : three `<Sequence>`s, each a `<ClipLayer>`
- `ClipLayer.tsx` : cover-fit video (`<OffthreadVideo>` for render, the Player-compatible video component for preview, following Remotion's current docs), trim via start offset, zoom via `interpolate` on `transform: scale()` with `transformOrigin` from `focus`, mute
- `Caption.tsx` : caption styles inside the safe zone
- `fonts.ts` : loads the bundled font file

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

Later migrations add `creators`, `clip_rights`, `video_stats`, and an `ai_generated` flag on `media`.

## 5. Media server (how the UI and renderer see local files)

Both the Player (in the Electron renderer) and Remotion's headless browser need to load local video by URL. Use one tiny HTTP server in main:

- Binds to `127.0.0.1` only, random free port, started at app launch
- Serves files from the library root only. Rejects path traversal (`..`), absolute paths, and anything outside the root after `path.resolve`.
- Requires a random per-session token in the URL (`/m/<token>/<relative path>`), so other local apps cannot read the library
- Supports HTTP Range requests (206 Partial Content), required for video seeking
- Correct `Content-Type` for mp4, jpg, png, json
- A helper `mediaUrl(relPath)` in shared code builds URLs; the base URL is fetched once from main

## 6. Import normalization (FFmpeg)

Every imported clip goes through: probe → decide → transcode → thumbnail → filmstrip.

**Probe** with ffprobe (`-show_streams -show_format -of json`). Extract duration, dimensions, rotation (display matrix side data), fps (avg_frame_rate and r_frame_rate, flag VFR when they differ), color_transfer, pix_fmt, creation time tags.

**HDR detection**: `color_transfer` is `arib-std-b67` (HLG, typical iPhone) or `smpte2084` (PQ).

**Transcode** (output is the "working file" used everywhere):
- Rotation baked in (ffmpeg autorotates by default when transcoding; verify with a rotated fixture)
- Scale so the long edge is at most 1920, keep aspect (cover-fit happens in the composition)
- HDR → SDR tone map. Preferred chain if `zscale` is available:
  `zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p`
  Check availability at startup (`ffmpeg -hide_banner -filters`). If missing, fall back to a filter the bundled build supports (e.g. `libplacebo` or `colorspace`) and log which path ran. Compare visually against the original on a real iPhone HDR clip.
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
5. `renderMedia({ codec: 'h264', composition, serveUrl, inputProps, outputLocation, onProgress, ... })`
   - Try Remotion's hardware acceleration option on macOS if the pinned version supports it; fall back to software.
   - Packaged builds: `binariesDirectory` → compositor inside `app.asar.unpacked`, `browserExecutable` → bundled headless browser.
6. Run the verify step (ffprobe) on the output. Mark video `exported`, write the `.recipe.json` sidecar.
7. On failure: mark `failed`, keep the recipe, surface the error with a "Copy details" button.

**Bundle**: dev builds the Remotion bundle on startup (or uses a watch build). Packaging runs a script that builds the bundle and copies it into the app resources. `ensureBrowser()` runs at package time and the browser is copied to `app.asar.unpacked`. Follow https://www.remotion.dev/docs/electron and the official Electron template; that page wins if it conflicts with this doc.

**Fallback plan** (only if Step 0.4's spike fails): an FFmpeg-only renderer that builds one filtergraph (trim, scale/crop, zoompan or scale expressions, concat, captions as pre-rendered transparent PNGs drawn with an overlay). The Player preview would then use the same caption PNGs. Record the switch in DECISIONS.md.

## 8. IPC surface (initial)

```ts
library.get() / library.choose() / library.mediaBaseUrl()
products.list({ search? }) / products.create(input) / products.update(id, patch) / products.remove(id) / products.setImage(id, filePath)
broll.list(productId) / broll.import(productId, filePaths[]) / broll.remove(id)
media.importUgc(filePaths[]) -> jobIds
captions.list({ productId?, slot? }) / captions.create / captions.update / captions.remove / captions.bulkAdd(text, productId?)
videos.saveDraft(recipe) / videos.list({ productId? }) / videos.get(id) / videos.export(recipe) -> jobId / videos.reveal(id)
jobs.cancel(id)
events: job:progress, job:done, job:failed
```

## 9. Security

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` where the template allows
- CSP restricting scripts to the app and media to the local media server
- All IPC payloads validated with zod in main
- API keys (later) stored with Electron `safeStorage`, never logged, never in the repo

## 10. Testing strategy

- **Unit (Vitest)**: everything in `src/shared/`, plus repository functions against a temp SQLite DB, plus the media server's path validation.
- **Media integration**: scripts that run normalization on each fixture and assert the output with ffprobe.
- **Render verify**: `scripts/verify-render.ts <file> <expectedSeconds>` asserts 1080x1920, 30 fps, h264, yuv420p, AAC, duration within 0.1 s, `faststart` (moov atom before mdat).
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
