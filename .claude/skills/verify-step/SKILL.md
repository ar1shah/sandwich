---
name: verify-step
description: Re-run the checks for a build step and report pass/fail
argument-hint: <step number, e.g. 1.2>
disable-model-invocation: true
---

Verify step $ARGUMENTS from `docs/BUILD_PROMPTS.md`. Do not write new features.

1. Read the step and list every check in its prompt (the "Checks" line) plus the golden rules in CLAUDE.md that apply.
2. Run `npm run lint` and `npm test`, then each step-specific check.
3. Output a table: check | command or method | result (pass / fail / skipped) | notes.
4. For any failure, explain the likely cause and propose a fix, but do not apply it until I say so.
5. List the human "Your checks" for this step so I can do them.
6. Only update `docs/CHECKLIST.md` if every automated check passed.
