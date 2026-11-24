<div align="center">

# Sandwich

An auto-editor for TikTok Shop UGC videos. You drop in a before clip, an after clip, and some product b-roll, and it stitches them together with trims, zooms, and captions. There's also a batch mode so you can crank out a bunch at once.

The name comes from the format: before and after on the outside, product in the middle. (Kind of.)

## Status

Early. There's no app code yet. Right now the repo is mostly planning docs and setup for building it with Claude Code. The code is coming step by step.

## Repo layout

```
CLAUDE.md                  project brief Claude Code reads every session
docs/
  ROADMAP.md               phases, what "done" means for each, who's doing what
  CHECKLIST.md             progress tracker
  BUILD_PROMPTS.md         the prompt for each build step
  reference/
    SPEC.md                features, flows, recipe format, caption tokens
    ARCHITECTURE.md        DB schema, media server, render pipeline, testing
    DECISIONS.md           why we picked what we picked
.claude/skills/            /next-step, /verify-step, /review
```

## Setup

You'll need Node (LTS), Git, the GitHub CLI, and Claude Code.

```bash
brew install node git gh
git clone https://github.com/ar1shah/sandwich.git
cd sandwich
claude
```

## How we're building it

Each step in `docs/BUILD_PROMPTS.md` is one Claude Code session:

1. Run `/next-step`
2. Read the plan, approve it or push back
3. Let it build and run its checks, then do the manual checks yourself
4. Commit, `/clear`, move on

Phase 0 we're doing together, since Step 0.4 is where we find out if the render approach actually works. After Step 1.1 we split up the work (see `docs/ROADMAP.md`).

A few things we've learned the hard way:

- One step per session. Long sessions get messy.
- Always eyeball the video output. Video bugs are visual and tests won't catch all of them.
- "This should work" isn't proof. Make it run a check.
- Keep `CLAUDE.md` short and up to date.
