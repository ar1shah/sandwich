# Prompts for the Claude App (non-coding work)

Claude Code builds the app. These prompts are for the regular Claude app (web, desktop, or phone) for the work around it: filling the caption bank, setting up products, reviewing exports, and analyzing results. Tip: put all of these in one Claude Project called "Sandwich ops" and upload `docs/SPEC.md` to it so Claude knows the formats.

---

## 1. Caption bank builder (from screenshots of winning videos)

Upload 5 to 20 screenshots of TikToks with on-screen captions, then:

```
These are screenshots of high-performing TikTok Shop videos. For each one, extract the on-screen caption text exactly as written.

Then convert them into caption templates for my editor:
- Replace specific product names with {product} (short, natural name) or {full} (full product name).
- Classify each into a slot: "before" (pain point / insecurity hook), "after" (result / transformation), "broll" (product call-out / recommendation), or "any".
- Keep the original voice, slang, and capitalization. Do not "improve" them.
- If a caption makes a medical or health claim (cures, treats, guaranteed results), flag it with a ⚠ at the end of the line so I can review it.

Output ONLY in this format, one per line, ready to paste:
slot | text

Use \n for line breaks inside a caption. After the list, give me a short table: which screenshot each line came from.
```

---

## 2. Caption variations (expand a winner)

```
Here's a caption that performed well for my "<slot>" slot: "<caption>"

Write 10 variations that keep the same hook structure and tone but change the wording, so I can test them without posting duplicates. Use {product} where the product name goes. Keep each under 12 words. No health claims, no guarantees. Output in the format:
slot | text
```

---

## 3. Product profile builder (until screenshot autofill exists)

Upload a screenshot of the product page:

```
From this product page screenshot, give me:
- full_name: the product's full name as listed (clean up SEO spam like keyword stuffing, keep brand + product + key variant)
- short_name: 3 options for how a creator would naturally say it in a caption ("the 501s", "this serum", "these jeans")
- slug: lowercase-dashes, short, for file names
- category
- where the main product photo is in the screenshot (describe it, so I can crop it)

Format as a small table I can copy into the app.
```

---

## 4. Export QA check

Render a video, take screenshots of 3 frames (one per clip, ideally with the TikTok UI showing if you've uploaded it as a draft), and upload them:

```
These are frames from a 9:16 TikTok video I made (before clip, after clip, product b-roll). Check:
1. Is any caption text covered by or too close to the TikTok UI (right-side buttons, bottom caption/username area, top bar)?
2. Is the caption readable on its background? Any spelling mistakes?
3. Does the framing cut off anything important (face, product)?
4. Do the colors look washed out or grey in any frame compared to the others?
Give me a short pass/fail list with specific fixes.
```

---

## 5. Hook performance review (after the hook tracker exists, or from a spreadsheet)

Export the stats CSV from the app (or paste your own sheet):

```
Here's my video performance data (one row per posted video: product, before caption, after caption, b-roll id, views, likes, orders, posted date).

1. Which before-captions (hooks) perform best by median views and by orders? Only call something a winner if it has at least 3 videos; otherwise mark it "needs more data".
2. Any patterns in the winning hooks (question vs statement, length, first word, emotion)?
3. Does b-roll choice seem to matter, or is it noise at this sample size?
4. Recommend the next 10 caption combos to test, in the bulk paste format "slot | text".
Be honest about uncertainty; small samples are noisy.
```

---

## 6. Second opinion when Claude Code is stuck

```
I'm building an Electron + React + Remotion desktop app with Claude Code. It's stuck on this problem:

<describe the problem>

What we tried:
<list>

Error / logs:
<paste>

Relevant code:
<paste the smallest relevant snippet>

Explain the likely root cause and give me a precise prompt I can paste back into Claude Code to fix it.
```

---

## 7. Creator outreach and usage-rights message

```
Write a short, friendly DM to a UGC creator asking for their before/after clips for <product>. Include: what we need (vertical, 10+ seconds each, natural light, no filters), how we'll use it (TikTok Shop ads and organic posts on our account), how long we'd use it, compensation <amount/terms>, and ask them to reply "I agree" to confirm usage rights. Keep it casual, under 100 words.
```
(Save the reply in the creator + rights log once Step 5.4 exists.)
