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

## #8 2026-10-15: FFmpeg + FFprobe from ffmpeg-static's pinned GitHub release
**Context:** Need ffmpeg and ffprobe for macOS arm64 + x64 now and Windows x64 later, with zscale/tonemap for HDR, libx264, and the filters normalization needs. Options compared:
- `ffmpeg-static` npm: ffmpeg only (no ffprobe), downloads only for the host at install time.
- `ffprobe-static` npm: ffprobe 4.0.2 from 2022, Intel-only on macOS. Rejected.
- FFmpeg inside Remotion's compositor package (n7.1): already shipped and unpacked, has zscale/tonemap/libx264/libx265, but built with `--disable-filters` and a whitelist that lacks `format`, `fps`, `transpose` (needed for autorotate), `tile`, `crop`, `pad`, `overlay`, `testsrc`. Also an internal Remotion artifact with a macOS 15 minimum. Rejected.
- Pinned download script against the `ffmpeg-static` GitHub release `b6.1.1`, which publishes both ffmpeg and ffprobe for every target. Chosen.
**Decision:** `scripts/ffmpeg-fetch.ts` downloads `ffmpeg-<target>.gz` and `ffprobe-<target>.gz` from release `b6.1.1`, gunzips, verifies SHA-256 of the decompressed binary against hashes pinned in `scripts/ffmpeg/fetch.ts`, and writes them to `vendor/ffmpeg/<target>/` (gitignored). If the file already exists and its hash matches, the download is skipped; a corrupted or wrong file is re-downloaded. Runs on `postinstall` for the host (warns and skips on unsupported hosts) and from the Forge `packageAfterCopy` hook for the target arch, which stages it into `ffmpeg-bin/<target>/` and adds that folder to `asar.unpackDir`.
Builds verified with `npm run ffmpeg:check`:
- darwin-arm64: FFmpeg 6.0 (osxexperts), all required filters/encoders present, h264_videotoolbox present, no libplacebo.
- darwin-x64: FFmpeg 6.1.1 (evermeet), same capability set (checked under Rosetta).
- win32-x64: 6.1.1 essentials (gyan.dev). Not run yet; `ffmpeg:check` on Windows in Step 5.1.
Hashes were recorded from the first download (trust on first use); the release publishes no checksums.
Licensing: these are GPL builds. Fine for internal use, revisit before distributing commercially (see CLAUDE.md).
Size: about 91 MB per arm64 install (ffmpeg + ffprobe), about 158 MB for x64.
**Why:** One source for both tools, every target we need, any target fetchable on any machine (so an arm64 Mac can package x64), and integrity checked.
**Revisit if:** We need a newer FFmpeg (bump the tag and hashes together), app size matters, or a target build loses a required capability.

## #9 2026-10-15: Required FFmpeg capabilities are enforced, not just logged
**Context:** A missing filter would only surface mid-import as a cryptic ffmpeg error.
**Decision:** `npm run ffmpeg:check` exits nonzero unless these exist: filters zscale, tonemap, scale, fps, transpose, crop, pad, tile, format; encoders libx264, aac. h264_videotoolbox, libplacebo and colorspace are reported as optional. The app also logs the same report at startup (non-blocking, errors go to stderr).
**Why:** Fail fast when changing the FFmpeg pin or adding a platform.
**Revisit if:** Normalization or filmstrips start using other filters (add them to `REQUIRED_FILTERS`).

## #10 2026-10-15: Probe parsing conventions
**Context:** ffprobe output differs across versions and devices.
**Decision:**
- `rotation` is the clockwise angle needed to display upright, normalized to 0/90/180/270. ffprobe's display matrix `rotation` is counter-clockwise (iPhone portrait reports `-90`), so it is negated; the legacy `rotate` tag is already clockwise. The display matrix wins when both exist.
- `isVfr` is true when `avg_frame_rate` and `r_frame_rate` differ by more than 1%. An exact comparison would flag nearly every phone clip.
- `recordedAt` prefers `com.apple.quicktime.creationdate` (capture time with local offset) over `creation_time` (can be export time), checking format tags before stream tags. 1904/1970 epoch placeholders count as missing. Stored as ISO 8601 UTC.
- ffprobe JSON is validated with a loose zod schema before parsing.
- Real iPhone sample (`tests/fixtures/probe/iphone_hlg_portrait.json`, 2026-10-15): portrait stored natively as 1080x1920 with no display matrix, HEVC Main 10 HLG with a Dolby Vision configuration record, 60 fps, and a second audio stream (Apple spatial audio, `apac`) that FFmpeg 6.0 cannot decode. Location, make, model, software and encoder tags were removed and dates replaced before committing. The -90 display matrix path is covered by unit tests, not a real clip, because this phone did not write one.
**Why:** Predictable values for normalization (Step 1.2) and date-based pairing (Step 4.2).
**Note for Step 1.2:** map the AAC audio stream explicitly (not "first audio stream" blindly) so the undecodable spatial audio track is never picked.
**Revisit if:** Real Android or screen-recording clips break these assumptions, or an older iPhone clip with a rotation matrix turns up (add it as a fixture).

## #11 2026-10-15: Split docs into planning and reference
**Context:** The humans only need the roadmap, checklist and build prompts day to day. The other docs are for Claude while building.
**Decision:** `docs/` keeps `ROADMAP.md`, `CHECKLIST.md`, `BUILD_PROMPTS.md` (plus future human-facing docs like `USER_GUIDE.md` and `FEEDBACK.md`). `SPEC.md`, `ARCHITECTURE.md`, `DECISIONS.md` moved to `docs/reference/`, and new design docs (e.g. `SHARING.md`) go there too. `CLAUDE_APP_PROMPTS.md` was deleted as unneeded; its caption-extraction prompt is still in git history (commit 0bd6ab4) if it is ever wanted.
**Why:** Less to scan; the files that track progress are the only ones at the top level.
**Revisit if:** Someone keeps missing a reference doc they needed.
