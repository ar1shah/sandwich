---
name: next-step
description: Find the next unchecked build step and start it (plan first)
argument-hint: [optional step number, e.g. 2.3]
disable-model-invocation: true
---

1. Read `docs/CHECKLIST.md` and find the first step in the earliest phase that is not ticked `[x]`. If the user passed a step number ($ARGUMENTS), use that step instead.
2. If the previous phase's exit test is not ticked, stop and tell the user which human checks are still open before moving on.
3. Read that step's prompt in `docs/BUILD_PROMPTS.md`, plus any docs it references.
4. Check `git status` and the current branch. If the working tree is dirty, stop and ask. Suggest creating the step's branch (shown in BUILD_PROMPTS.md) if we're not on it.
5. Present a concise plan for the step: files to create/change, approach, risks, and the checks you will run at the end. Wait for approval before writing code.
6. After approval, do the step exactly as written. Do not start the next step.
7. Finish by running the step's checks, reporting results honestly (passed / failed / skipped and why), listing the "Your checks" the human still needs to do, ticking only the boxes that genuinely passed in `docs/CHECKLIST.md`, and suggesting a commit message.
