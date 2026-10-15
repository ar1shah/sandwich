# Real clips

Drop real footage here. This folder is gitignored except this README, so nothing you add is ever committed.

Use these base names so tests and scripts can pick the clips up opportunistically and skip cleanly when they are missing. Any video extension and any letter case is fine (`.mov`, `.MOV`, `.mp4`, `.MP4`); lookups match on the base name:

| File | What it should be | Why |
|---|---|---|
| `iphone_hdr.mov` | A recent iPhone video shot in portrait, straight from the camera roll (HLG HDR, usually HEVC, often 60 fps) | HDR tone mapping, `recordedAt`, Dolby Vision and spatial audio edge cases |
| `screen_recording.mov` | A screen recording from a phone or Mac | Usually variable frame rate, odd sizes, silent or system audio |
| `creator_horizontal.mp4` | A real landscape (horizontal) creator clip | Crop and fit into 9:16, long edge downscale |

Originals are never modified. Imports are copied and normalized into the library folder.

The generated test media (labels, timecodes, sync pulses) is made by `npm run fixtures` and lives next to this folder in `fixtures/`.
