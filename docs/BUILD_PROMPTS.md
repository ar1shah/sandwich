# Sandwich: Build Prompts for Claude Code

Copy-paste prompts to build the whole app, one step at a time, with checks after each step.

## How to use this file

1. **One step = one fresh session.** Run `/clear` (or start a new `claude` session) before each step so context stays clean. `CLAUDE.md` loads automatically every session.
2. **Plan first.** Press `Shift+Tab` to enter Plan mode, paste the prompt, read the plan, push back if something looks off, then approve.
3. **Let it run the checks.** Every prompt ends by asking Claude to run checks and report. Read the report. "Should work" is not a check.
4. **Do your own checks.** The "Your checks" list is stuff only a human can judge (does the video look right, does the UI feel right).
5. **Commit.** When everything passes, Claude ticks `docs/CHECKLIST.md` and suggests a commit. Commit, push, open a PR if you're splitting work.
6. **Shortcut:** the project skill `/next-step` (in `.claude/skills/`) finds the next unchecked step and runs it in plan mode, and `/verify-step` re-runs a step's checks. They read this file, so keep it updated.

If a step goes sideways, see "When things go wrong" at the bottom.

---

# Phase 0: Foundation

### Step 0.1: Scaffold the app
**Branch:** `step/0.1-scaffold`

```
We're starting the Sandwich app described in CLAUDE.md. Read CLAUDE.md, docs/SPEC.md, and docs/ARCHITECTURE.md first.

Step 0.1: scaffold the project.

1. Look up the current official Remotion Electron template and its docs page (https://www.remotion.dev/docs/electron). Use that template as the base, since it already solves packaged rendering with Electron Forge + Vite. Tell me what the template gives us before changing anything.
2. Add: TypeScript strict mode, React, Tailwind, Zustand, zod, ESLint + Prettier, Vitest, Playwright (for Electron later, just install for now).
3. Create the folder structure from CLAUDE.md (src/main, src/preload, src/renderer, src/shared, remotion, scripts, tests, fixtures). If the template's layout differs, keep the template's layout for the Electron shell and map our folders onto it. Log the mapping in docs/DECISIONS.md.
4. Make sure all Remotion packages are pinned to the exact same version with no ^.
5. Add npm scripts: dev, test, lint (eslint + tsc --noEmit), make. Leave placeholders for fixtures, render:sample, verify:render.
6. Replace the template's demo UI with a plain shell: left sidebar (Products, Captions, New Video, Batch, History, Settings), main area showing the page name. Dark UI, clean, nothing fancy yet.
7. Set Electron security defaults: contextIsolation true, nodeIntegration false. Expose a typed window.api from preload with one function, app.version(), and show it in the sidebar footer.
8. Add one trivial Vitest test in tests/ so the test runner is proven.
9. Create .gitignore entries: node_modules, out, dist, fixtures/* except fixtures/generate script, .env, *.log.
10. Update the Commands section of CLAUDE.md with the real commands.

Checks to run and report: npm install, npm run lint, npm test, and npm run dev (confirm the window opens with the sidebar, then close it). Report any warnings you think matter.
```

**Your checks**
- [ ] `npm run dev` opens a window with the sidebar and the version number
- [ ] `npm test` and `npm run lint` pass
- [ ] `git status` shows no `node_modules` or junk files staged

---

### Step 0.2: FFmpeg binaries + probe
**Branch:** `step/0.2-ffmpeg`

```
Step 0.2: bundle FFmpeg and FFprobe and build the probe utility. See docs/ARCHITECTURE.md sections 2 and 6.

1. Pick a way to ship ffmpeg and ffprobe binaries for macOS (arm64 + x64) and later Windows x64. Options: ffmpeg-static/ffprobe-static npm packages, or downloading builds in a script. Compare them briefly (size, license, available filters like zscale and libx265, Apple Silicon support) and recommend one. Log the choice in docs/DECISIONS.md.
2. src/main/media/binaries.ts: resolve paths for dev vs packaged (packaged binaries must come from app.asar.unpacked), and for mac vs win (.exe). Configure the packager so the binaries are unpacked.
3. src/main/media/probe.ts: run ffprobe with an args array, parse JSON, and return a typed ProbeResult: duration, width, height, rotation (from display matrix side data or rotate tag), displayWidth/displayHeight (after rotation), fps, isVfr, hasAudio, colorTransfer, isHdr (HLG arib-std-b67 or PQ smpte2084), pixFmt, recordedAt (creation_time or com.apple.quicktime.creationdate), codec.
4. src/main/media/capabilities.ts: on startup run `ffmpeg -hide_banner -filters` and `-encoders` once and report whether zscale, libplacebo, tonemap, libx264, libx265 exist. Log this at startup.
5. Put the pure parts (parsing ffprobe JSON into ProbeResult, rotation math, HDR detection, fps parsing like "30000/1001") in src/shared/probeParse.ts with unit tests using saved sample JSON (add 3 to 4 realistic ffprobe JSON samples to tests/fixtures/probe/, including an iPhone HLG HEVC sample and a rotated sample).
6. Add a dev script `npm run probe -- <file>` that prints the ProbeResult.

Checks: lint, test, and run `npm run probe` on any video file you can generate quickly with the bundled ffmpeg (e.g. a 3 second testsrc). Print the capabilities report.
```

**Your checks**
- [ ] `npm run probe -- <a real iPhone video from your camera roll>` shows `isHdr: true` (most recent iPhone videos are HLG) and a sensible `recordedAt`
- [ ] Capabilities report shows libx264 and at least one tone map path (zscale or libplacebo)

---

### Step 0.3: Test fixtures
**Branch:** `step/0.3-fixtures`

```
Step 0.3: build the fixture generator from docs/ARCHITECTURE.md section 10.

1. scripts/generate-fixtures.ts using the bundled ffmpeg (args arrays, no shell strings). Generate every fixture listed in ARCHITECTURE.md. Each clip should be visually distinct and show a burned-in label + running timecode (drawtext) so trims and order are easy to verify by eye. Give each a different tone frequency for audio.
2. The rotated fixture must be landscape pixels with rotation metadata, so it tests our rotation handling.
3. The HDR fixture: only if libx265 is available; tag it as HLG bt2020 10-bit. Skip with a clear message otherwise.
4. Also write fixtures/sample.recipe.json matching the Recipe shape in docs/SPEC.md section 3 (paths relative to fixtures/ for now), with captions on all three clips and zoom on the before clip.
5. Create fixtures/real/README.md telling the user to drop real clips there (an iPhone HDR video, a screen recording, a horizontal video) and make sure fixtures/real/* except the README is gitignored.
6. npm run fixtures runs it. It should be idempotent and print a summary table (file, duration, size, probe highlights) using our probe util.

Checks: run npm run fixtures twice, show the summary table, confirm probe reports the expected rotation, fps, and HDR flags for each file.
```

**Your checks**
- [ ] Open a few fixtures in QuickTime: labels and timecodes are visible
- [ ] Drop a real iPhone clip, a screen recording, and a horizontal video into `fixtures/real/`

---

### Step 0.4: Packaged render spike (DECISION GATE)
**Branch:** `step/0.4-render-spike`

```
Step 0.4: prove that Remotion can render a video from inside a PACKAGED Electron app on this Mac. This is the riskiest part of the project, so we test it before building anything else. Re-read https://www.remotion.dev/docs/electron.

1. In remotion/, create a throwaway composition "Spike" (1080x1920, 30fps, 6 seconds) that plays two fixture videos back to back with a text overlay. Load media through a URL (use a minimal local HTTP server on 127.0.0.1 with range support for now; the real one comes in Step 1.3).
2. In main, add an IPC call spike.render() that runs selectComposition + renderMedia in the main process and writes to ~/Movies/sandwich-spike.mp4, reporting progress to the UI.
3. Packaged builds: build the Remotion bundle at package time (not bundle() at runtime), ship it in app resources, make sure the compositor binary and the headless browser are in app.asar.unpacked, and pass binariesDirectory and browserExecutable explicitly. Follow the official template's approach.
4. Add a temporary "Render spike" button on the Settings page.
5. Measure and report: render time for the 6 second video in dev and in the packaged app, CPU arch, packaged app size.
6. Try Remotion's hardware-accelerated encoding option on macOS if our pinned version has it, and report the speed difference.

Checks: npm run make, then launch the packaged .app from Finder (not from the terminal), click Render spike, confirm the mp4 exists and plays. Tell me exactly what you had to change to make packaging work and log it in docs/DECISIONS.md.

If packaged rendering cannot be made to work after a solid attempt, STOP and write up what failed, then propose switching to the FFmpeg-only renderer described in docs/ARCHITECTURE.md section 7. Do not switch without my go-ahead.
```

**Your checks**
- [ ] Packaged app launched by double-clicking (right-click → Open if Gatekeeper blocks it) renders the spike video
- [ ] Render time for 6 s of video is acceptable (rough target: under 20 s on an M-series Mac)
- [ ] **Decision recorded:** Remotion (go) or FFmpeg renderer (fallback)

---

# Phase 1: Render engine

### Step 1.1: Shared logic + recipe schema
**Branch:** `step/1.1-shared`

```
Step 1.1: build the pure logic in src/shared/ with thorough unit tests. No UI. Read docs/SPEC.md sections 2, 3, 5.2, 6, 8.

Create, each with tests:
1. recipe.ts: zod schema + inferred types for Recipe and ClipSpec exactly as in SPEC.md section 3, including the refinements (trimStart + duration <= sourceDuration, duration > 0, clips ordered before/after/broll). Export helpers: totalDuration(recipe), isRenderable(recipe), createEmptyRecipe(product, defaults).
2. tokens.ts: resolveTokens(text, product) supporting {product}, {short}, {full}; returns { text, unknownTokens[] }. Test fallback when short_name is empty, repeated tokens, unknown tokens, case.
3. slug.ts: slugify per SPEC.md section 6 (apostrophes stripped, ASCII, Windows-safe). Test emojis, accents, apostrophes, very long text, reserved Windows names.
4. naming.ts: buildExportName({ productSlug, beforeCaption, date, existingNames }) → { folder, fileName, sidecarName }. Test the counter, empty caption ("no-caption"), 30 char hook cap.
5. captionFilter.ts: filterCaptions(captions, { slot, productId }) with product-specific first, then by use_count.
6. bulkPaste.ts: parseBulkCaptions(text) per SPEC.md bulk format; returns { captions, errors[] } with line numbers. Test blank lines, missing pipe, invalid slot, \n escapes, extra spaces.
7. rng.ts (seeded PRNG) and shuffleBag.ts (no back-to-back repeats, uses everything before repeating, deterministic with a seed).
8. pairing.ts: pairInOrder(files), pairByDate(files with recordedAt and mtime), pairTwoColumns(befores, afters); return rows plus leftovers. Test odd counts and missing dates.
9. safeZone.ts: constants + a helper that returns the safe rect in pixels for 1080x1920.

Checks: npm test with coverage for src/shared (aim for 90%+), npm run lint. Show me the coverage summary.
```

**Your checks**
- [ ] Skim the token and naming tests; they should read like the examples in SPEC.md
- [ ] Coverage for `src/shared` is high and nothing is skipped

---

### Step 1.2: Import normalization
**Branch:** `step/1.2-normalize`

```
Step 1.2: build import normalization exactly as described in docs/ARCHITECTURE.md section 6.

1. src/main/media/normalize.ts: normalize(inputPath, outputPath, { onProgress, signal }) → { probe, outputProbe, wasHdr, toneMapPath }. Build the ffmpeg args from the probe result. Pure arg-building goes in src/shared/ffmpegArgs.ts with unit tests (HDR vs SDR, rotated, no audio, VFR, 60fps, horizontal).
2. Tone mapping: use the zscale chain if available, otherwise the best fallback the capabilities report allows. Record which path ran.
3. Progress via -progress pipe:1. Cancellation via AbortSignal kills the process and deletes the partial file.
4. src/main/media/thumbs.ts: thumbnail at 10% of duration (360px wide jpg).
5. src/main/media/filmstrip.ts: sprite sheet, 1 frame per second, max 60 frames, 120px tall frames. Return { path, frameCount, frameWidth, frameHeight, interval }.
6. Script: npm run normalize -- <in> <out> for manual testing.
7. Integration test script (scripts/test-normalize.ts) that normalizes every fixture into out/normalized/ and asserts with probe: H.264, yuv420p, 30fps constant, bt709, has audio, long edge <= 1920, rotation baked (no rotation metadata, correct orientation), duration within 0.1s of source.

Checks: run the integration script and show a pass/fail table. Then normalize every file in fixtures/real/ and report probe before vs after.
```

**Your checks (important)**
- [ ] Open your real iPhone HDR clip and its normalized version side by side. Colors and brightness should look close. If the normalized one looks grey or washed out, do not move on; tell Claude and iterate on the tone map.
- [ ] Rotated fixture plays upright after normalizing
- [ ] Look at one filmstrip image: frames in order

---

### Step 1.3: Local media server
**Branch:** `step/1.3-media-server`

```
Step 1.3: build the media server from docs/ARCHITECTURE.md section 5, replacing the spike's temporary server.

1. src/main/mediaServer.ts using node:http only (no express). 127.0.0.1, random free port, random session token, root = library root (for now fixtures/ in dev).
2. Range requests (206) with correct Content-Range, Accept-Ranges, Content-Length; 416 for bad ranges. HEAD support. Content-Type by extension.
3. Path safety: decode, normalize, resolve against root, reject anything outside root, reject absolute paths, reject wrong token (403), 404 for missing files. Put the path-check function in src/shared or a pure module and unit test it with traversal attempts (../, encoded %2e%2e, backslashes for Windows, null bytes).
4. Expose library.mediaBaseUrl() over IPC; add a shared mediaUrl(base, relPath) helper that encodes path segments.
5. Write an automated test that starts the server on a temp dir and checks: full GET, range GET, bad token, traversal, missing file.

Checks: npm test, plus curl examples hitting the running dev server (full request, range request headers showing 206). Show the curl output.
```

**Your checks**
- [ ] Paste a media URL into Chrome while the app runs: the video plays and you can scrub
- [ ] Changing the token in the URL gives 403

---

### Step 1.4: The composition
**Branch:** `step/1.4-composition`

```
Step 1.4: build the real <SandwichVideo> composition in remotion/, per docs/ARCHITECTURE.md section 2 (Remotion) and docs/SPEC.md sections 3, 7, 8. Delete the Spike composition when done.

1. Root.tsx: Composition "Sandwich", 1080x1920, 30fps, inputProps = { recipe, mediaBaseUrl }. Use calculateMetadata to set durationInFrames from totalDuration(recipe) (round to frames carefully so 3 clips sum exactly).
2. SandwichVideo.tsx: three <Sequence>s back to back. Frame math lives in a pure helper (src/shared/timeline.ts) with tests: given the recipe, return each clip's from/durationInFrames and its source start frame.
3. ClipLayer.tsx: cover-fit the media to 1080x1920 using object-fit cover with object-position from focus; trim via the start offset; mute toggle; zoom:
   - none: scale 1
   - slow-push: scale 1.0 → 1.12 over the clip, ease in-out
   - punch-in: scale 1.0 → 1.25 in the first 0.25s, ease-out, then hold
   transform-origin from focus. Use the correct Remotion video component for render vs Player per current Remotion docs, and make sure the same component tree is used in both.
4. Caption.tsx: outline and box styles, top and middle positions, inside the safe zone from src/shared/safeZone.ts, wrapping at ~80% safe width, max 3 lines, shrink-to-fit. Support \n line breaks. Bundle one open-license font (check Google Fonts for TikTok Sans first; otherwise pick a clean sans and tell me which) and load it so it is ready before frames render.
5. A debug inputProp showSafeZone (default false) that draws the safe-zone rectangle. The Player will use it as an overlay toggle.
6. Make fixtures/sample.recipe.json render in Remotion Studio for visual checking (npm run studio).

Checks: npm test (timeline math), lint, and render 4 still frames (start of each clip + one mid-zoom) to out/frames/ using renderStill, with showSafeZone on. Describe what you see in each frame by opening the images.
```

**Your checks**
- [ ] `npm run studio`: scrub through the sample. Order is before → after → b-roll, trims start where the recipe says (timecode labels help), zoom feels smooth, not jittery
- [ ] Captions stay inside the safe zone rectangle in every frame
- [ ] Both caption styles look like something you'd see on TikTok

---

### Step 1.5: Render CLI + verify
**Branch:** `step/1.5-render-cli`

```
Step 1.5: wire real rendering, a CLI for it, and the verify script. See docs/ARCHITECTURE.md section 7 and 10.

1. src/main/render/renderRecipe.ts: renderRecipe(recipe, { outputPath, mediaBaseUrl, onProgress, signal }) using selectComposition + renderMedia with codec h264, 30fps, pixel format yuv420p, AAC audio, and the packaged-binary options from Step 0.4. Make sure the output has +faststart (check whether Remotion does this by default; if not, add a fast remux step).
2. scripts/render.ts → npm run render -- <recipe.json> <out.mp4>; npm run render:sample renders fixtures/sample.recipe.json to out/sample.mp4. The CLI starts the media server itself.
3. scripts/verify-render.ts → npm run verify:render -- <file> [expectedSeconds]: assert 1080x1920, 30fps constant, h264, yuv420p, AAC 48k stereo, duration within 0.1s, moov before mdat. Print a pass/fail table and exit non-zero on failure.
4. Log render time per second of output.

Checks: npm run render:sample, then npm run verify:render -- out/sample.mp4 12 (or whatever the sample length is). Show both outputs. Then build a recipe using the normalized real clips from fixtures/real and render + verify that too.
```

**Your checks**
- [ ] Play `out/sample.mp4` with sound: audio is in sync, b-roll is muted, captions match the recipe
- [ ] AirDrop the real-clip render to your phone and watch it full screen
- [ ] **Phase 1 exit test passes** (see ROADMAP.md)

---

# Phase 2: Library

### Step 2.1: Library folder + database
**Branch:** `step/2.1-library-db`

```
Step 2.1: library folder and SQLite. See docs/ARCHITECTURE.md sections 3 and 4.

1. First-launch flow: if no library is configured, show a welcome screen to choose or create a library folder (default ~/Movies/SandwichLibrary). Store the chosen path in app settings (userData). Settings page shows the path and lets you switch libraries.
2. Warn (do not block) if the chosen path is inside Dropbox, Google Drive, OneDrive, or iCloud Drive, explaining that the database can corrupt in synced folders.
3. better-sqlite3 in main, WAL mode, foreign keys on. Make sure the native module is rebuilt for Electron and unpacked in packaged builds.
4. Migrations runner: db/migrations/NNN_name.sql, transactional, tracked in schema_migrations. 001_init.sql with the schema from ARCHITECTURE.md section 4.
5. Repositories for products, media, captions, videos with typed inputs/outputs. Paths stored relative to the library root with forward slashes; a helper converts to absolute with path.join.
6. Point the media server root at the library folder.
7. Tests: repositories against a temp DB file (CRUD, cascade deletes, relative path round trip).

Checks: npm test, lint, then npm run dev, pick a library folder, confirm library.db and the folder layout are created. Then npm run make and launch the packaged app to confirm better-sqlite3 loads there too.
```

**Your checks**
- [ ] Fresh launch shows the welcome screen; second launch goes straight in
- [ ] Packaged app opens the DB with no native module error

---

### Step 2.2: Job queue
**Branch:** `step/2.2-jobs`

```
Step 2.2: the job queue from docs/ARCHITECTURE.md section 2 (jobs).

1. src/main/jobs/: typed job definitions (normalize, thumbnail, filmstrip, render), per-type concurrency (normalize/thumbnail/filmstrip: 2, render: 1), cancel via AbortController, progress events to the renderer (job:progress, job:done, job:failed) with a jobId and a human label.
2. A composite "importClip" flow: copy file into the library → normalize → thumbnail → filmstrip → insert media row. Partial files cleaned up on failure or cancel. Original file never touched.
3. Renderer: a small jobs tray in the bottom of the sidebar showing active jobs with progress bars and cancel buttons, and the last few finished/failed jobs.
4. Make the scheduler logic (queueing, concurrency, cancellation state) a pure, unit-tested module with fake job runners.

Checks: npm test; then in dev, add a temporary dev-only button that imports all fixtures at once and show me the tray behavior (2 at a time, progress moving, cancel works and cleans up). Remove the button after or hide it behind a dev flag.
```

**Your checks**
- [ ] Importing 6 clips at once runs 2 at a time and the UI never freezes
- [ ] Cancel leaves no partial files in the library folder

---

### Step 2.3: Products
**Branch:** `step/2.3-products`

```
Step 2.3: products feature. See docs/SPEC.md section 2 (Product) and 5.1 step 1. Use the frontend-design approach: clean, fast, dark, visual.

1. Products page: responsive grid of product cards (square image, full name, short name in muted text, b-roll count). Search box filters by full or short name instantly. Recently used products pinned first (last_used_at).
2. Add / edit product modal: image (drag-drop or pick a file; copied into products/<id>/image.jpg, resized to max 800px), full name (required), short name (optional, with a hint: "what you'd say in a caption, e.g. 'the 501s'"), slug (auto from full name, editable, must be unique). Live preview of how "10/10 {product}" resolves.
3. Delete with a confirm dialog that says how many b-roll clips and captions will be deleted with it.
4. A reusable <ProductPicker> component (the same card grid in a modal/popover with search and keyboard navigation: arrows + enter) for the editor and batch mode later.
5. Empty state that explains what a product is and has an "Add your first product" button.

Checks: lint, test (add tests for slug uniqueness handling), and a Playwright Electron smoke test: create a product with an image, search for it, edit it, delete it.
```

**Your checks**
- [ ] Add 3 real products with real photos; finding one takes under 2 seconds by eye or search
- [ ] Short name preview makes sense

---

### Step 2.4: B-roll library
**Branch:** `step/2.4-broll`

```
Step 2.4: b-roll per product. See docs/SPEC.md section 2 (B-roll).

1. Product detail page (click a product card): header with image + names + edit button, and a "B-roll" section.
2. Drag-drop or pick multiple files to import as b-roll for this product using the importClip flow (kind = broll, product_id set). Show placeholder tiles with progress while importing.
3. Thumbnail grid (9:16 tiles) with duration badges. Hover plays a muted preview through the media server. Click opens a larger preview.
4. Delete b-roll (confirm). Deleting removes the files from the library folder too.
5. Reusable <BrollPicker productId> component (grid, hover preview, select one) for the editor.

Checks: lint, test, Playwright smoke test: import 2 fixtures as b-roll, see thumbnails, delete one, confirm the file is gone from disk.
```

**Your checks**
- [ ] Import real b-roll for each of your 3 products; hover previews are smooth
- [ ] Horizontal or HDR b-roll looks right in thumbnails

---

### Step 2.5: Caption bank
**Branch:** `step/2.5-captions`

```
Step 2.5: caption bank. See docs/SPEC.md section 2 (Caption, tokens, bulk paste).

1. Captions page: filters for product (All, Generic, or a specific product via ProductPicker) and slot (before/after/broll/any), plus text search. Table/list with text, slot badge, product (or "Generic"), use count, edit and delete actions.
2. Add/edit form: text (multi-line), slot, product or generic. Live token preview using a selected product, warnings for unknown tokens.
3. Bulk add: a textarea that accepts the bulk paste format, shows a parsed preview with per-line errors before saving, and lets you choose product or generic for the whole batch.
4. Product detail page gets a "Captions" tab showing captions for that product plus generic ones.
5. Reusable <CaptionPicker slot productId> that uses captionFilter, shows resolved text, and returns the chosen caption.

Checks: lint, test, Playwright smoke: bulk add 5 captions (one invalid line shows an error), filter by slot, edit one, delete one.
```

**Your checks**
- [ ] Bulk paste 15 real captions from winning videos (use the Claude app prompt in `docs/CLAUDE_APP_PROMPTS.md` to extract them from screenshots)
- [ ] **Phase 2 exit test passes**

---

# Phase 3: Manual mode (MVP)

### Step 3.1: Editor shell
**Branch:** `step/3.1-editor-shell`

```
Step 3.1: the editor shell for manual mode. See docs/SPEC.md section 5.1 steps 1 to 3.

1. "New Video" page: step 1 is the ProductPicker (full page grid). Choosing a product creates a draft Recipe (createEmptyRecipe with default durations from settings) in a Zustand editor store and updates last_used_at.
2. Editor layout: left column with three slot cards (Before, After, B-roll) showing thumbnail, duration, caption snippet, and status; center reserved for the preview (next step); right column for the selected clip's panel (next steps).
3. Before/After slot cards accept drag-drop or file pick; importing runs the importClip flow (kind = ugc) and shows progress on the card. When done, the clip's mediaPath, sourceDuration, and a default trim (start 0, duration = slot default or the clip length if shorter) are set.
4. B-roll card opens the BrollPicker filtered to this product.
5. Drafts autosave to the videos table (status draft) with a debounce, and the History page (stub) lists drafts so nothing is lost on close.
6. Settings page: default durations per slot and target total range.

Checks: lint, test (store logic tests: create draft, set clip, defaults when clip is shorter than default), Playwright smoke: pick product, import before/after fixtures, pick b-roll, reload app, draft restored.
```

**Your checks**
- [ ] Building a draft with real clips feels quick and obvious

---

### Step 3.2: Live preview
**Branch:** `step/3.2-preview`

```
Step 3.2: the preview. See golden rule 2 in CLAUDE.md.

1. Center column: @remotion/player rendering the same SandwichVideo composition with inputProps from the editor store, sized to fit the column at 9:16, with play/pause, scrubber, and loop.
2. Safe-zone overlay toggle (uses the composition's showSafeZone prop).
3. Total length indicator: green inside the target range, amber outside, with the per-slot breakdown.
4. Clicking a slot card seeks the player to that clip's start.
5. Show a clear placeholder in the player for slots that don't have media yet.
6. Keep preview performance smooth: memoize inputProps, avoid re-renders of the Player on unrelated state changes.

Checks: lint, test, then run the app with a full draft and confirm the preview matches out/sample.mp4 behavior from Step 1.5 (same order, trims, zoom, captions). Report any difference between preview and render.
```

**Your checks**
- [ ] Preview plays smoothly with real clips
- [ ] Safe-zone toggle works

---

### Step 3.3: Trim panel
**Branch:** `step/3.3-trim`

```
Step 3.3: the trim UI. See docs/SPEC.md section 5.1 step 4 (Trim).

1. Right column clip panel, Trim section: the clip's filmstrip across the full width, with a highlighted window over it representing [trimStart, trimStart + duration].
2. Drag the window body to move it (duration stays fixed). Drag either edge to change duration. Snap to 0.1s. Clamp to the clip bounds and a minimum of 0.5s.
3. While dragging, the Player previews the frame at the window start (or the edge being dragged).
4. Numeric fields for start and duration (editable), plus "Reset to default length".
5. Keyboard: left/right nudge window by 0.1s (shift = 1s), [ and ] nudge the start/end edges.
6. All trim math (drag deltas → new trimStart/duration with clamping and snapping) in a pure tested module src/shared/trimMath.ts.

Checks: lint, test (trimMath edge cases: at bounds, min length, snapping, clip shorter than default), Playwright: drag the window and assert the recipe updated.
```

**Your checks**
- [ ] Trimming a long real creator clip to the best 3 seconds takes seconds, and the preview confirms it
- [ ] It feels like trimming an Instagram story, not fighting a timeline

---

### Step 3.4: Clip controls + captions
**Branch:** `step/3.4-clip-controls`

```
Step 3.4: zoom, mute, and captions in the clip panel. See docs/SPEC.md section 5.1 step 4 and section 7.

1. Zoom toggle (off = none, on = slow-push). Mute toggle (defaults: before/after unmuted, b-roll muted).
2. Caption section: "Pick caption" opens CaptionPicker filtered by this slot and product. Choosing one resolves tokens and fills an editable multi-line text box (remember sourceCaptionId, increment use_count on export, not on pick). "Clear caption" option.
3. Style (outline/box) and position (top/middle) segmented controls.
4. "Save to bank" saves the current edited text as a new caption (asks slot and product vs generic, prefilled with current slot and product). Editing the text box never changes the bank otherwise.
5. Warn inline if the caption is long enough that it shrinks below a readable size.
6. Everything updates the preview live.

Checks: lint, test, Playwright: pick a caption with {product}, confirm resolved text in the preview DOM/state, edit it, save to bank, confirm the bank has the new caption and the original is unchanged.
```

**Your checks**
- [ ] Caption with `{product}` resolves to the short name
- [ ] Captions look good in both styles on real footage (bright and dark backgrounds)

---

### Step 3.5: Export
**Branch:** `step/3.5-export`

```
Step 3.5: export. See docs/SPEC.md section 6 and docs/ARCHITECTURE.md section 7.

1. Export button (disabled until isRenderable). Validate the recipe with zod in main.
2. Build the name with naming.ts (existing names read from the target folder), render via the job queue's render job, with progress shown in the editor and the jobs tray. Cancel supported (partial file deleted).
3. After render: run the verify checks from scripts/verify-render.ts as a function (move the logic into src/main/render/verify.ts and reuse it in the script). If verification fails, mark the video failed and show why.
4. On success: write the .recipe.json sidecar, update the video row (exported, export_path), increment use_count for captions used, show a done state with "Show in Finder" (shell.showItemInFolder) and "New video, same product".
5. Errors show a readable message plus "Copy details" (full error + recipe) for debugging.

Checks: lint, test (naming collision via the real folder), Playwright: full flow from product pick to exported file on disk; then run verify on the file.
```

**Your checks**
- [ ] Export 2 videos with the same hook on the same day: the second gets `_02`
- [ ] Sidecar `.recipe.json` sits next to the mp4

---

### Step 3.6: History + MVP hardening
**Branch:** `step/3.6-mvp-polish`

```
Step 3.6: history page and MVP hardening.

1. History page: exported and draft videos, grouped by product, with thumbnail (frame from the before clip), name, date, duration, status. Actions: open draft, show in Finder, delete record (asks whether to also delete the file).
2. Go through every screen and handle: empty states, loading states, failed imports (with retry), missing media (file deleted from disk outside the app: show a clear "missing" state instead of crashing).
3. Add an app-level error boundary and a log file in userData (rotate at a few MB). Settings: "Open logs folder".
4. Review: run a full Playwright smoke suite end to end, fix flakiness.
5. Package with npm run make and test the packaged app end to end: new library, product, b-roll, captions, full video export.
6. Write docs/USER_GUIDE.md: a one-page guide for my friend (install, first launch, make a video, where files go, known issues).

Checks: lint, test, full Playwright suite, packaged app run-through. Report anything flaky or slow.
```

**Your checks**
- [ ] **Phase 3 exit test passes** (3 real videos, uploaded as TikTok drafts, under 3 minutes each)
- [ ] Send the packaged app to your boy; he can install it with only `USER_GUIDE.md`

---

# Phase 4: v1

### Step 4.1: Reopen + duplicate
**Branch:** `step/4.1-reopen`

```
Step 4.1: reopen and duplicate. From History, "Edit" loads any exported video's recipe into the editor (validate with zod; if media files are missing, show which and allow replacing them). Re-export creates a new file (never overwrites) and a new video row linked to the original (add a parent_video_id column via migration 002). "Duplicate" opens a copy as a new draft. Also support File > Open Recipe to load a .recipe.json sidecar from disk if its media exists in this library.

Checks: lint, test (migration test, recipe load with missing media), Playwright: export, reopen, change caption, re-export, two files exist.
```

**Your checks**
- [ ] Reopen a video from last week, change one caption, re-export in under a minute

---

### Step 4.2: Batch intake + pairing board
**Branch:** `step/4.2-batch-pairing`

```
Step 4.2: batch intake and the pairing board. Read docs/SPEC.md section 5.2 carefully, including the note about Finder drop order.

1. Batch page: ProductPicker, then an intake screen with three modes as tabs: In order, All at once, Two drop zones. Each mode uses the pure pairing functions from src/shared/pairing.ts.
2. Imports start immediately in the background (importClip) while you arrange pairs; recordedAt from probe is used for "All at once".
3. Pairing board: two columns (Before | After), one row per video, thumbnails with hover preview. Drag a thumbnail to reorder within its column (rows re-pair), swap button per row, remove row, and a tray of unpaired clips that can be dragged into empty cells. Use a solid drag-and-drop library (e.g. dnd-kit).
4. The board state is a pure reducer with tests (move, swap, remove, add from tray, odd counts).
5. A batch is saved as a draft (batches table via migration 003: id, product_id, created_at, state_json) so closing the app doesn't lose it.

Checks: lint, test (reducer), Playwright: All at once with 6 fixtures → pairs created → swap one row → state persists after reload.
```

**Your checks**
- [ ] Dump 10 real clips in random order; fixing the pairs takes under a minute

---

### Step 4.3: Auto-fill + review grid
**Branch:** `step/4.3-batch-review`

```
Step 4.3: auto-fill and the review grid. See docs/SPEC.md section 5.2 steps 4 and 5.

1. "Auto-fill" turns pairs into recipes: b-roll via shuffleBag over the product's b-roll, captions per slot via a seeded random pick avoiding repeats within the batch where possible (fallback to repeats with a warning), default trims and settings. Store the seed; "Re-roll" picks a new seed for b-roll, captions, or both.
2. Review grid: one row per video showing the three thumbnails, the three captions, total length with color, and warnings (clip shorter than default, no caption, duplicate caption). Bulk actions: toggle zoom for all befores, set caption style for all.
3. Clicking a row opens the same editor (preview + clip panels) for that recipe in a drawer or split view, and returns to the grid.
4. Auto-fill logic is pure and tested in src/shared/batchFill.ts.

Checks: lint, test (no back-to-back b-roll, deterministic with seed, caption repeat fallback), Playwright: auto-fill 5 rows, edit one row's caption, grid updates.
```

**Your checks**
- [ ] Auto-filled batch looks like something you'd actually post, before any edits

---

### Step 4.4: Render queue
**Branch:** `step/4.4-render-queue`

```
Step 4.4: batch render queue. "Render all" queues one render job per valid row (invalid rows are skipped with a reason). Sequential rendering through the existing job queue. Per-row status (queued, rendering %, done, failed with reason), overall progress and ETA based on measured render speed, cancel all, retry failed, continue on error. System notification when the batch finishes. Prevent the Mac from sleeping during a batch render (powerSaveBlocker) and release it after. All exports land in the normal export folders and appear in History tagged with the batch id.

Checks: lint, test, Playwright: batch of 4 with one intentionally broken recipe → 3 done, 1 failed, retry after fixing works.
```

**Your checks**
- [ ] **Phase 4 exit test:** 10 pairs from folder dump to 10 exported videos with under 15 minutes of hands-on time

---

### Step 4.5: Zoom styles + focus point
**Branch:** `step/4.5-zoom-styles`

```
Step 4.5: replace the zoom toggle with a segmented control (None, Slow push, Punch-in). Add a focus point picker: click on the preview to set focus {x, y} for the selected clip (shown as a small crosshair while the panel is focused), used for both cover-fit framing and the zoom origin. "Reset focus" returns to center. Batch review gets "zoom style for all befores". Keep the composition as the only place zoom math lives.

Checks: lint, test, render still frames for each zoom style with an off-center focus and describe them.
```

---

### Step 4.6: Undo/redo + shortcuts
**Branch:** `step/4.6-undo`

```
Step 4.6: undo/redo for the editor store (e.g. zundo or a small custom history; coalesce continuous drags into one undo step), Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z. Shortcuts: space play/pause, 1/2/3 select slot, Z toggle zoom, M toggle mute, C open caption picker, Cmd/Ctrl+E export. A "?" overlay lists all shortcuts. Make shortcuts platform-aware (Cmd on mac, Ctrl on Windows).

Checks: lint, test (history coalescing), Playwright: trim drag then undo restores the previous trim.
```

---

### Step 4.7: Still images as clips
**Branch:** `step/4.7-stills`

```
Step 4.7: allow images (jpg, png, heic) in any slot. Import converts to a normalized jpg (heic converted via ffmpeg or sharp; check what works cross-platform), stored as media kind 'image' with no intrinsic duration. In the recipe an image clip has sourceDuration = its duration and trimStart = 0; the trim UI is replaced by a duration slider. Default zoom for images is slow-push. The composition renders images with the same cover-fit/focus/zoom logic.

Checks: lint, test, render a recipe with an image before slot and verify.
```

---

# Phase 5: Later

Use the same pattern: one step per session, plan first, checks at the end. Starter prompts:

### Step 5.1: Windows build + CI
```
Step 5.1: Windows support. Audit the codebase for anything that breaks on Windows (paths, binary names, shell usage, file name rules, keyboard shortcuts, font loading, the media server path checks with backslashes, Remotion compositor/browser for win32-x64). Add Windows targets to the packager. Add a GitHub Actions workflow that runs lint + test on macos-latest and windows-latest, and builds installers for both on tags. Write a test plan for a real Windows machine. Report every change and anything you couldn't verify without Windows hardware.
```
Your check: install on a real Windows PC (or a Windows VM) and run the Phase 3 exit test.

### Step 5.2: Screenshot autofill
```
Step 5.2: screenshot autofill for new products. In the Add product modal, add "Fill from screenshot": drop a product page screenshot, main sends it to the Claude API (current Sonnet-class vision model; check the docs at https://docs.claude.com for the current model id and the recommended way to get structured JSON output) and gets back { fullName, shortNameSuggestions[3], category, price?, productImageBox: {x,y,w,h} as fractions }. Crop the product photo from the screenshot using the box and offer it as the product image. Everything lands in the editable form; nothing saves without confirmation. API key entered in Settings, stored with Electron safeStorage, never logged, never sent to the renderer. Handle no-key, offline, and bad-response cases. Add a cost note in Settings. Put the response parsing/validation in a tested pure module.
```
Your check: 5 real product screenshots, correct names on at least 4, crop is usable.

### Step 5.3: Hook tracker
```
Step 5.3: hook tracker. Migration for video_stats (video_id, posted_url, posted_at, views, likes, comments, shares, orders, updated_at). History rows get a "Stats" editor. A Hooks page ranks captions (by sourceCaptionId, falling back to text) and b-roll by median views and average orders, with minimum sample size shown and filters by product and date range. CSV export of all stats. Pure aggregation module with tests.
```

### Step 5.4: Creator + rights log + AI flag
```
Step 5.4: creators and usage rights. Migration for creators (id, name, handle, contact, notes) and clip rights on media (creator_id, rights_status: pending|granted|revoked, rights_date, rights_note, ai_generated boolean). UGC import asks for the creator (quick pick or add). Editor and batch review show the creator per clip. History can filter by creator and rights status; revoking rights flags every video using that creator's clips. Videos using any media marked ai_generated show an "AI content: label when posting" badge in History and in the export done screen. Optional {creator} token in the export name pattern.
```

### Step 5.5: Shared library
```
Step 5.5: shared library for two users. Design doc first (save to docs/SHARING.md, wait for my approval): Supabase for products, captions, videos, stats, creators (Postgres + auth + row level security for a two-person team), media files in a shared drive folder that each machine maps to a local path, relative paths everywhere, conflict handling (updated_at last-write-wins plus a conflict log), offline behavior, and migration of each person's existing local library. The SQLite file must never live in the synced folder. Do not write code until I approve the design.
```

### Step 5.6: Auto-captions (Whisper)
```
Step 5.6: optional spoken-word captions. Evaluate whisper.cpp options for Electron on mac and Windows (binary vs node binding, model size vs speed, word timestamps), recommend one, then add "Transcribe" on a UGC clip that produces timed word captions rendered by a new caption mode in the composition (word-by-word highlight). Fully local, model downloaded on first use with consent and a size warning.
```

### Step 5.7: Face-match pairing
```
Step 5.7: in batch "All at once" mode, add optional face-match pairing: extract a frame per clip, compute face embeddings locally (evaluate a small on-device model that runs in Node/Electron on mac and Windows), and pair clips by similarity, falling back to date order. Show a confidence per row on the pairing board. Everything stays local.
```

---

# When things go wrong

**Bug you can describe**
```
Bug: <what you did> → <what you expected> → <what happened>. Error/logs: <paste>. Before changing code, reproduce it (write a failing test if the logic is testable), explain the root cause, then fix it and show the test passing. Don't paper over it with try/catch.
```

**Video looks wrong**
```
The exported video looks wrong: <describe: washed out colors / caption cut off / zoom jitter / audio out of sync / wrong clip order>. Recipe: <paste .recipe.json>. Probe the source media and the output, render still frames at the problem timestamps to out/debug/, open them, and figure out which stage is responsible (normalize, composition, or encode) before fixing.
```

**Claude went off the rails**
```
Stop. Run git diff --stat and summarize what you changed. Compare it against the step in docs/BUILD_PROMPTS.md and list anything out of scope. Then propose the smallest set of changes to get back on track. Don't change anything until I confirm.
```
(Or just `git restore .` / `git checkout` the branch and rerun the step in a fresh session with a tighter prompt.)

**Before every PR**
```
Review the diff on this branch like a strict senior engineer: bugs, edge cases, cross-platform issues (Windows paths, binary names), main-process blocking, missing zod validation on IPC, missing tests for pure logic, anything that breaks golden rules in CLAUDE.md. List findings by severity, then fix the high ones.
```

**Library upgrade broke something**
```
After upgrading <package>, <what broke>. Read the package's changelog/migration guide for the versions involved, list breaking changes that affect us, and fix them. If it's Remotion, keep every Remotion package on the same exact version.
```
