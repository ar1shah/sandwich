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
