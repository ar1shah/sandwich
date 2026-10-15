# Sandwich: Product Spec

## 1. What it does

Every video follows the same "sandwich" template, 11 to 15 seconds total:

| Slot | Content | Source | Default length |
|---|---|---|---|
| 1. Before | Insecurity / pain point | UGC creator (new each video) | 3.0 s |
| 2. After | Transformation | UGC creator (new each video) | 4.0 s |
| 3. B-roll | Real product shot | Product library (reused) | 5.0 s |

Default lengths are editable in Settings. The editor shows a running total and turns it green inside the target range (11 to 15 s, also editable).

Users: two people, each on a MacBook. Windows support later.

## 2. Core concepts

### Product
The product is the filter for everything. Picking a product limits b-roll and captions to that product (plus generic caption templates).

| Field | Example | Notes |
|---|---|---|
| image | product photo | shown on every product picker card |
| full_name | Levi's 501 Original Fit Jeans | search, file naming |
| short_name | the 501s | what sounds natural in captions (optional) |
| slug | levis-501 | auto from full_name, editable, used in export paths |

### B-roll
Product footage stored per product. Imported once, reused forever. Normalized on import, with a thumbnail and a hover preview.

### Caption
| Field | Notes |
|---|---|
| text | may contain tokens and line breaks |
| slot | `before`, `after`, `broll`, or `any` |
| product_id | null means generic template, usable with every product |

**Tokens** (resolved by a pure function in `src/shared/tokens.ts`):
- `{product}` : short_name, falling back to full_name
- `{full}` : always full_name
- `{short}` : alias of `{product}`
- Unknown tokens are left as-is and flagged with a warning in the UI.

Examples with product "Levi's 501 Original Fit Jeans" / short "the 501s":
- `10/10 {product}` → `10/10 the 501s`
- `{product} changed my whole wardrobe` → `the 501s changed my whole wardrobe`
- `4 weeks later` → unchanged

**Caption picker filtering:** when editing slot X with product P, show captions where `slot in (X, any)` AND `product_id in (P, null)`. Product-specific captions sort first.

**Bulk paste format** (used by the caption bank "Bulk add" box and by the Claude app prompts):
```
before | I can't fix my smile lines, it's genetics
after | 4 weeks later
broll | your sign to try {product}
any | 10/10 {product}
```
One caption per line. Lines without a `|` default to slot `any`. `\n` inside text means a line break.

## 3. The Recipe (single source of truth)

Every video is one Recipe. Defined with zod in `src/shared/recipe.ts` and versioned.

```ts
type Slot = 'before' | 'after' | 'broll';
type ZoomStyle = 'none' | 'slow-push' | 'punch-in';   // MVP UI only exposes none / slow-push as a toggle

interface ClipSpec {
  slot: Slot;
  mediaPath: string;      // relative to library root (normalized file)
  sourceDuration: number; // seconds, from probe
  trimStart: number;      // seconds into the source
  duration: number;       // seconds shown in the final video (> 0)
  zoom: ZoomStyle;
  focus: { x: number; y: number }; // 0..1, crop/zoom anchor, default 0.5/0.5
  muted: boolean;         // defaults: before/after false, broll true
  caption: {
    text: string;         // already token-resolved, user-edited
    sourceCaptionId?: string;
    style: 'outline' | 'box';
    position: 'top' | 'middle';  // both inside the safe zone
  } | null;
}

interface Recipe {
  schemaVersion: 1;
  id: string;             // uuid
  productId: string;
  productSlug: string;
  clips: [ClipSpec, ClipSpec, ClipSpec]; // always before, after, broll in that order
  output: { width: 1080; height: 1920; fps: 30 };
  createdAt: string;      // ISO
  updatedAt: string;
}
```

Rules:
- `trimStart + duration <= sourceDuration` (validated; UI clamps)
- Total duration = sum of clip durations
- A recipe is valid for rendering only if all three clips have media
- Sidecar file: every export writes `<name>.recipe.json` next to the mp4

## 4. Features by phase

### MVP
1. **Library folder**: on first launch pick a folder (default `~/Movies/SandwichLibrary`). Holds the DB, media, and exports.
2. **Products**: add / edit / delete with image, full name, short name. Visual card grid with search and "recent" pinned first.
3. **B-roll library** per product: drag in clips, background normalize, thumbnail grid, hover preview, delete.
4. **Caption bank**: add / edit / delete, slot tags, product or generic, live token preview, search, bulk paste.
5. **Import normalization** for every clip (see ARCHITECTURE.md): HDR tone map, rotation, constant 30 fps, max 1920 px long edge, H.264 SDR.
6. **Manual mode editor** (flow below).
7. **Export** with auto naming and recipe sidecar, progress bar, "Show in Finder".
8. **Video history**: list of exported videos per product.

### v1
1. **Reopen and edit** any past video from its recipe. Duplicate as new.
2. **Batch mode** (flow below).
3. **Render queue**: sequential, progress per item, cancel, retry failed, continue on error, system notification when done.
4. **Zoom styles**: none / slow push / punch-in, plus focus point picker (click on the preview to set the zoom anchor).
5. **Undo / redo** in the editor and keyboard shortcuts.
6. **Still images as clips** (auto slow push-in, default duration).

### Later
1. **Screenshot autofill**: drop a product page screenshot, a vision model (Claude API) returns full name, suggested short name, category, and a bounding box for the product photo. User confirms in an editable form. API key stored with Electron `safeStorage`, never in code.
2. **Shared library**: Supabase for products / captions / video metadata, shared drive (Google Drive / Dropbox) for media only. NEVER put the SQLite file in a synced folder.
3. **Windows build** + GitHub Actions CI for both platforms.
4. **Hook tracker**: per exported video, log posted URL, date, views, likes, sales. Leaderboard by caption and by b-roll. CSV export.
5. **Creator + rights log**: creator name and handle per UGC clip, usage-rights status, date received, notes. Optional `{creator}` in export names.
6. **AI-generated content flag** per clip, shown in history and the rights log, so synthetic media can be labeled when posting.
7. **Auto-captions** with Whisper (local, whisper.cpp) for spoken clips.
8. **Face-match pairing** for batch mode.

## 5. User flows

### 5.1 Manual mode
1. **Pick product** from the image card grid (search on top, recents first).
2. **Drop before + after clips** onto their slots (drag and drop or file picker). Each is copied + normalized in the background with a progress indicator on the slot.
3. **Pick b-roll** from a thumbnail grid that only shows this product's b-roll. Hover to preview.
4. **Edit each clip** (select a slot to open its panel):
   - **Trim**: filmstrip of the clip with a sliding window. The window defaults to the slot's default length. Drag the window to choose which part plays, drag its edges to change length. Snaps to 0.1 s. Playhead scrubbing.
   - **Zoom toggle** (on = slow push)
   - **Mute toggle**
   - **Caption**: pick from the filtered list → tokens resolve → text lands in an editable box. Style (outline / box) and position (top / middle). "Save to bank" stores the edited text as a new caption. Edits never change the bank otherwise.
5. **Preview** the whole video in the Player with a safe-zone overlay toggle and the total length indicator.
6. **Export**. Name generated automatically. Progress bar. Done state with "Show in Finder" and "Make another with same product".

Drafts autosave (debounced) so a crash or accidental close loses nothing.

### 5.2 Batch mode (v1)
1. **Pick product** once for the batch.
2. **Add clips**, any of three ways:
   - **In order**: drop before1, after1, before2, after2... one at a time; pairs fill as they arrive.
   - **All at once**: drop everything; first-guess pairing by recording date (`creation_time` / `com.apple.quicktime.creationdate` from probe, fallback file mtime), consecutive clips paired.
   - **Two drop zones**: "Befores" box and "Afters" box, paired top to bottom.
   - Note: multi-file drops from Finder do not guarantee order, so "all at once" always sorts by date and the pairing board is the final check.
3. **Pairing board**: two columns of thumbnails (before | after), one row per video. Drag to reorder within a column, swap button per row, remove row, add unpaired clips from a tray.
4. **Auto-fill**: b-roll assigned with a shuffle bag (no back-to-back repeats, every b-roll used before any repeats). Captions picked randomly per slot without repeating within the batch when possible. Seeded RNG so "Re-roll" is deliberate and results are reproducible.
5. **Review grid**: one row per video with thumbnails, captions, total length, warnings (e.g. clip shorter than default length). Click a row to open the same editor panel as manual mode. Trims default to the first N seconds.
6. **Render queue**: render all, progress per row, cancel, retry failed.

## 6. Export naming

Pattern: `{productSlug}_{hook}_{date}_{n}.mp4`

- `hook` = slug of the first 4 words of the before caption, max 30 chars, `no-caption` if empty
- `date` = local date `YYYY-MM-DD`
- `n` = 2-digit counter, increments until the name is unused
- Folder: `<library>/exports/<productSlug>/<date>/`
- Sidecar: same name with `.recipe.json`
- Slugify: lowercase, ASCII only, `[a-z0-9-]`, collapse dashes, strip apostrophes (`can't` → `cant`)
- Names must be valid on Windows too (no `<>:"/\|?*`, no trailing dot or space, avoid reserved names like `CON`)

Example: `levis-501_cant-fix-my-smile_2026-10-15_03.mp4`

## 7. Caption look

- Font: one open-license font bundled with the app and loaded inside the composition (check Google Fonts for TikTok Sans; otherwise a clean geometric sans). The same font file is used in preview and render.
- `outline` style: white text, black stroke, subtle shadow
- `box` style: black text on a white rounded box (TikTok native look)
- Font size ~64 px at 1080 width, max 2 to 3 lines, auto wrap at ~80% of safe width, shrink to fit if needed
- Positions: `top` (upper third inside safe zone) and `middle`

## 8. Safe zone

Defined once in `src/shared/safeZone.ts` as fractions of the frame, so it can be tuned:
- top: 0.08, bottom: 0.22, left: 0.06, right: 0.16 (starting values; tune by testing real uploads)
- The preview overlay draws this zone. Captions are laid out inside it.

## 9. Non-goals

- General-purpose timeline editing, transitions library, music, color grading, text animation presets beyond the two styles. Keep the cookie cutter simple.
