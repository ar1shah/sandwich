# Sandwich: Build Checklist

Source of truth for progress. Claude ticks a box only after that step's checks actually ran and passed. Humans tick the "You" boxes.

Legend: `[ ]` todo · `[x]` done · `[~]` in progress · `[!]` blocked (add a note)

## Setup (do once, by hand)
- [x] Node LTS installed (`node -v`)
- [x] Git + GitHub repo created, both of you added as collaborators
- [x] Claude Code installed and logged in on both Macs
- [x] This starter kit copied into the repo root and committed

## Phase 0: Foundation
- [x] 0.1 Scaffold (Remotion Electron template, TS strict, Tailwind, Zustand, zod, lint, Vitest, sidebar shell)
  - [x] You: `npm run dev` window opens, lint + tests pass
- [x] 0.2 FFmpeg binaries + probe + capabilities report
  - [x] You: real iPhone clip probes as HDR with recordedAt
- [x] 0.3 Fixture generator + sample.recipe.json
  - [x] You: real clips added to `fixtures/real/`
- [x] 0.4 Packaged render spike (see DECISIONS #14)
  - [x] You: packaged .app renders from Finder launch
  - [x] Decision logged: Remotion / FFmpeg fallback (keep Remotion, DECISIONS #14)

## Phase 1: Render engine
- [x] 1.1 Shared logic + recipe schema (90%+ coverage on src/shared)
- [x] 1.2 Import normalization (HDR tone map, rotation, CFR, thumbs, filmstrip)
  - [x] You: real HDR clip vs normalized look the same side by side
- [x] 1.3 Media server (range requests, token, traversal-safe)
  - [x] You: media URL plays and scrubs in Chrome; wrong token gives 403
  - [x] You: packaged .app (npm run make, open from Finder) still renders the spike
- [x] 1.4 SandwichVideo composition (trim, zoom, captions, safe zone)
  - [x] Cleanup: remove Spike composition, spike IPC, and Settings spike section (spike media server already removed in 1.3, spike.ts now uses the real server)
  - [x] You: Studio scrub looks right, captions in safe zone
- [ ] 1.5 Render CLI + verify script
  - [ ] You: real-clip render watched on phone
- [ ] **Phase 1 exit test**

## Phase 2: Library
- [ ] 2.1 Library folder + SQLite + migrations (works in packaged app)
- [ ] 2.2 Job queue + jobs tray
- [ ] 2.3 Products (cards, search, recents, ProductPicker)
- [ ] 2.4 B-roll library (import, hover preview, BrollPicker)
- [ ] 2.5 Caption bank (CRUD, tokens preview, bulk paste, CaptionPicker)
- [ ] **Phase 2 exit test** (3 products, b-roll, 15 captions survive relaunch)

## Phase 3: Manual mode (MVP)
- [ ] 3.1 Editor shell (slots, import, b-roll pick, autosave drafts, settings)
- [ ] 3.2 Live preview (Player, safe-zone overlay, length indicator)
- [ ] 3.3 Trim panel (filmstrip window, snapping, keyboard)
- [ ] 3.4 Clip controls (zoom, mute, caption pick/edit/style/save to bank)
- [ ] 3.5 Export (naming, verify, sidecar, Show in Finder)
- [ ] 3.6 History + hardening + packaged run-through + USER_GUIDE.md
- [ ] **Phase 3 exit test** (3 real videos posted as TikTok drafts, under 3 min each)
- [ ] MVP sent to partner, one week of real use, notes in `docs/FEEDBACK.md`

## Phase 4: v1
- [ ] 4.1 Reopen + duplicate + open .recipe.json
- [ ] 4.2 Batch intake (3 modes) + pairing board
- [ ] 4.3 Auto-fill (shuffle bag, seeded captions) + review grid
- [ ] 4.4 Render queue (cancel, retry, notifications, no sleep)
- [ ] 4.5 Zoom styles + focus point
- [ ] 4.6 Undo/redo + shortcuts
- [ ] 4.7 Still images as clips
- [ ] **Phase 4 exit test** (10 pairs → 10 videos, under 15 min hands-on)

## Phase 5: Later
- [ ] 5.1 Windows build + CI
- [ ] 5.2 Screenshot autofill
- [ ] 5.3 Hook tracker
- [ ] 5.4 Creator + rights log + AI-generated flag
- [ ] 5.5 Shared library (design approved first)
- [ ] 5.6 Auto-captions (Whisper)
- [ ] 5.7 Face-match pairing

## Notes / blockers
<!-- Claude and humans: add dated notes here, e.g. "2026-10-20: 0.4 blocked on compositor path, see DECISIONS #3" -->
