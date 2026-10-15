# Sandwich

Auto-editor for TikTok Shop UGC videos: before clip → after clip → product b-roll, with trims, zoom, a caption bank, and batch mode.

This repo starts as a **starter kit** for building the app with Claude Code. No app code yet; Claude Code writes it step by step.

## What's in here

| File | What it's for |
|---|---|
| `CLAUDE.md` | Project brief Claude Code reads automatically every session: stack, golden rules, output spec, how to work |
| `docs/SPEC.md` | What the app does: features, flows, recipe format, naming, caption tokens |
| `docs/ARCHITECTURE.md` | How it's built: processes, DB schema, media server, normalization, render pipeline, testing |
| `docs/ROADMAP.md` | Phases, exit tests, how to split work between two people, risks |
| `docs/BUILD_PROMPTS.md` | Copy-paste prompts for every build step, each with checks |
| `docs/CHECKLIST.md` | Progress tracker (Claude ticks steps only when checks pass) |
| `docs/DECISIONS.md` | Log of big decisions and why |
| `docs/CLAUDE_APP_PROMPTS.md` | Prompts for the regular Claude app: caption bank from screenshots, product setup, QA, hook analysis |
| `.claude/commands/` | Custom slash commands: `/next-step`, `/verify-step 1.2`, `/review` |

## One-time setup (both of you)

1. Install Node LTS, Git, and the GitHub CLI (`brew install node git gh` if you use Homebrew).
2. Install Claude Code and log in (see the Claude Code docs for the current install command).
3. One person creates a GitHub repo, copies this kit into it, commits, and pushes. Add the other as a collaborator.
4. Both clone the repo and run `claude` in the repo folder.

## How to build

1. In Claude Code, run `/next-step` (or paste Step 0.1 from `docs/BUILD_PROMPTS.md`).
2. Review the plan it proposes. Approve or push back.
3. Let it build and run the checks. Do the "Your checks" yourself.
4. Commit, then `/clear` and do the next step.

Do Phase 0 together on one machine; Step 0.4 decides whether the whole render approach works. After Step 1.1, split work using the table in `docs/ROADMAP.md`.

## Rules of thumb

- One step per session. Fresh context beats a long messy one.
- Never skip the human checks on video steps. Video bugs are visual.
- If Claude says "this should work," ask it to prove it with a check.
- Keep `CLAUDE.md` short and accurate. Update it when commands or rules change.
