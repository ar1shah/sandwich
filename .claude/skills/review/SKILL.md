---
name: review
description: Strict review of the current branch before opening a PR
disable-model-invocation: true
---

Review `git diff main...HEAD` like a strict senior engineer. Check for:

- Bugs and unhandled edge cases (empty states, missing media, cancel mid-job, very short or very long clips)
- Golden rule violations from CLAUDE.md (preview vs render divergence, main-process blocking, renderer touching fs, absolute paths in the DB, binaries loaded from app.asar)
- Cross-platform problems (string paths, `/` separators, shell strings, `.exe` names, Windows-invalid file names, Cmd vs Ctrl)
- IPC handlers without zod validation
- Pure logic without unit tests
- Leftover debug code, console.logs, TODOs without a CHECKLIST note
- Anything out of scope for the current step

Output findings grouped by severity (high / medium / low) with file:line references. Then fix the high-severity ones, run lint + tests, and summarize what changed.
