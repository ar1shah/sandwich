# Sandwich: Roadmap

Each phase ends with an exit test you actually perform. Do not start the next phase until the exit test passes. Rough time estimates assume two people working evenings with Claude Code.

| Phase | Name | Goal | Est. |
|---|---|---|---|
| 0 | Foundation | Repo, tooling, fixtures, prove Remotion renders inside a packaged Electron app | 2 to 4 days |
| 1 | Render engine | Recipe JSON in, correct MP4 out, from the command line | 3 to 5 days |
| 2 | Library | Products, b-roll, captions stored and browsable | 4 to 6 days |
| 3 | Manual mode (MVP) | Build and export a full video in the app | 5 to 8 days |
| 4 | v1 | Batch mode, render queue, reopen, zoom styles, undo | 1 to 2 weeks |
| 5 | Later | Windows, autofill, hook tracker, rights log, sharing, auto-captions | ongoing |

## Phase 0: Foundation
**Why first:** the riskiest part of the whole project is getting Remotion's renderer (native compositor + headless browser) working inside a packaged `.app`. Find out in week 1, not week 5.

Steps: 0.1 scaffold · 0.2 ffmpeg binaries + probe · 0.3 fixtures · 0.4 packaged render spike (decision gate)

**Exit test:** a packaged `.app` (not dev mode), launched from Finder, renders a hardcoded 3-clip test video to disk.
The same packaged `.app` must also render on the second MacBook after being AirDropped there (so it arrives quarantined by Gatekeeper).

## Phase 1: Render engine
Steps: 1.1 shared logic + recipe schema · 1.2 import normalization · 1.3 media server · 1.4 composition · 1.5 render CLI + verify

**Exit test:** `npm run render:sample` produces a video that passes `verify:render`, and a real iPhone HDR clip normalized by the app looks the same as the original next to it (not grey or washed out).

## Phase 2: Library
Steps: 2.1 library folder + DB · 2.2 job queue · 2.3 products · 2.4 b-roll · 2.5 caption bank

**Exit test:** add 3 real products with images, 2+ b-roll each, and 15 captions via bulk paste. Quit and relaunch: everything is still there and thumbnails load.

## Phase 3: Manual mode (MVP)
Steps: 3.1 editor shell · 3.2 preview · 3.3 trim · 3.4 clip controls + captions · 3.5 export · 3.6 history + MVP hardening

**Exit test (the real one):** make 3 videos for real products from real creator clips, AirDrop them to a phone, upload as TikTok drafts. Captions sit clear of the TikTok UI, colors look right, audio is in sync, length is 11 to 15 s. Each video takes under 3 minutes to make.

**MVP shipped.** Package the app and send it to your boy. Both use it for a week before starting Phase 4. Write down every annoyance in `docs/FEEDBACK.md`; those notes reorder Phase 4.

## Phase 4: v1
Steps: 4.1 reopen/duplicate · 4.2 batch intake + pairing board · 4.3 auto-fill + review grid · 4.4 render queue · 4.5 zoom styles + focus point · 4.6 undo/redo + shortcuts · 4.7 still images

**Exit test:** batch of 10 pairs from a folder dump to 10 exported videos in under 15 minutes of hands-on time, with zero renamed files.

## Phase 5: Later (pick in any order based on need)
- 5.1 Windows build + CI (do this before anyone on Windows needs it)
- 5.2 Screenshot autofill (Claude API vision)
- 5.3 Hook tracker
- 5.4 Creator + rights log + AI-generated flag
- 5.5 Shared library (Supabase + shared drive)
- 5.6 Auto-captions (Whisper)
- 5.7 Face-match pairing

## Splitting work between two people

After Step 1.1 lands (the shared recipe schema), work can run in parallel:

| Person A (engine) | Person B (UI) |
|---|---|
| 1.2 normalization | 2.1 library + DB |
| 1.3 media server | 2.2 job queue |
| 1.4 composition | 2.3 products |
| 1.5 render CLI | 2.4 b-roll (needs 1.2) |
| 3.5 export | 2.5 caption bank |
| 4.4 render queue | 3.1 to 3.4 editor |

Rules: one branch per step (`step/2.3-products`), PR into `main`, the other person pulls and runs the app before merging. Never run two Claude Code sessions on the same branch.

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Remotion renderer fails in packaged app | Blocks export | Step 0.4 spike first; fallback FFmpeg renderer in ARCHITECTURE.md §7 |
| HDR clips look washed out | Every iPhone clip looks bad | Normalize on import, test with a real iPhone clip in Step 1.2 |
| Captions under TikTok UI | Videos underperform | Safe-zone overlay + real upload test in Phase 3 exit |
| `better-sqlite3` native build breaks on Electron upgrade | App won't start | Pin Electron version, rebuild native deps in postinstall, test after upgrades |
| Slow renders | Batch mode painful | Measure in 0.4 and 1.5; try hardware encoding; tune concurrency |
| Library on a synced drive corrupts DB | Data loss | Warn if library path is inside Dropbox/Drive/iCloud; sharing done via Supabase later |
| Remotion license threshold | Legal | Free under 4 people involved; recheck before growing or selling |
| Unsigned app warnings | Friction installing; macOS 15 (Sequoia) removed the right-click → Open bypass | Move the app to /Applications, open it once, then System Settings > Privacy & Security > Open Anyway (or `xattr -cr /Applications/Sandwich.app`); Apple Developer account if distributing |
