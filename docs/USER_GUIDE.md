# Sandwich: user guide

Sandwich turns raw creator clips into a finished TikTok Shop video. Every video has the same three parts: a **Before** clip, an **After** clip, and a **B-roll** clip of the product. You pick the clips, trim them, add captions, and press Export. You add music later, in the TikTok app.

This guide is one page on purpose. If something is not here, send a message and say what you were doing.

## 1. Install

You need a Mac with Apple Silicon (M1 or newer) running macOS 15 or later. It will not run on an Intel Mac.

1. You get a file called `Sandwich.zip` (it is big, about 1 GB, because the video renderer is inside). Double click it to unzip. You get `Sandwich.app`.
2. **Drag `Sandwich.app` into your Applications folder first.** Do not open it from Downloads.
3. Open it from Applications. macOS says it cannot verify the app. Click **Done** (do not click Move to Trash).
4. Open **System Settings > Privacy & Security**, scroll down, and click **Open Anyway** next to "Sandwich was blocked". Enter your password, then click **Open Anyway** again.
5. If you do not see the Open Anyway button, open Terminal and run this once, then open the app again:

```bash
xattr -cr /Applications/Sandwich.app
```

You only do this the first time. After that Sandwich opens like any other app.

## 2. First launch

Sandwich asks where to keep your **library**. This is one folder that holds everything: products, clips, captions, and your finished videos. The suggested folder is `Movies/SandwichLibrary`.

- Keep it on your Mac's own disk. **Do not put it in iCloud Drive, Dropbox or Google Drive.** Those apps can damage the database while Sandwich is using it. Sandwich warns you if you try.
- Click **Use this folder**. You can look at the folder in Finder at any time.

Sandwich never changes or deletes your original clips. When you add a clip, Sandwich makes its own copy in the library.

## 3. Set up once per product

On the sidebar:

1. **Products**: click **Add product**. Type the full name (for example "Levi's 501 Jeans"), an optional short name, and a photo. A product is the thing you sell.
2. Click the product, then **Add b-roll**: drop in the video files of the product itself. Sandwich prepares them in the background. You reuse this b-roll in every video for that product.
3. **Captions**: add the lines you like from your best videos. **Bulk add** lets you paste many at once, one per line. Write `{product}` where the product name goes and Sandwich fills it in (`{full}` always uses the full name).

## 4. Make a video

1. Click **New Video** and choose the product.
2. Drop a clip on **Before** and one on **After** (or click Choose file). Sandwich shows progress on the card. It accepts `.mp4`, `.mov` and `.m4v`.
3. Click **Choose b-roll** and pick one of the product's clips. Hover a clip to preview it.
4. Click a card to edit that clip:
   - **Trim**: drag the window along the strip to choose which part plays. Drag its edges to make it shorter or longer. The arrow keys nudge it by 0.1 second.
   - **Zoom** and **Mute** switches.
   - **Caption**: pick one from your bank, then edit the text if you want. Choose the style (outline or box) and the position (top or middle). **Save to bank** keeps your edited version for next time.
5. Watch the preview. The length shows under it (11 to 15 seconds is the default target). Turn on the safe zone to see where TikTok's buttons will cover the video.
6. Press **Export**. It takes a minute or two. When it says "Your video is ready" you can click **Show in Finder** or **New video, same product**.

Your draft saves by itself. If you close the app in the middle of a video, it comes back when you open the app again.

## 5. Where your videos go

Inside the library folder:

```
exports/<product>/<date>/<product>_<first words of the Before caption>_<date>_01.mp4
exports/<product>/<date>/<product>_<first words of the Before caption>_<date>_01.recipe.json
```

The second video with the same hook on the same day gets `_02`, and so on. The `.recipe.json` file next to each video is a small record of how it was made. Keep it with the video.

Upload the `.mp4` from there to TikTok and add the music in the TikTok app.

## 6. History

**History** lists every video, grouped by product: drafts you can still open, videos you exported, and exports that failed.

- **Open** brings a draft back into the editor.
- **Show in Finder** reveals an exported video.
- **Delete** removes it from History. For an exported video you can also tick "Also move the video file to the Trash". If you leave it unticked, the video and its recipe file stay in your exports folder.
- **File missing** means you moved or deleted the video outside Sandwich.

## 7. If something goes wrong

- A clip that fails to import shows a red message and a **Try again** button.
- A clip that was deleted from the library outside Sandwich shows as **missing** on its card. Replace it.
- If the whole window shows "Something went wrong", click **Reload**. Your work is saved. If a draft does not come back by itself, open it from History.
- For anything else: **Settings > Troubleshooting > Open logs folder**, then send the files in that folder with a sentence about what you were doing.

## 8. Known issues

- The preview of the very last frame of a clip can be one frame earlier than the exported video. The export is the truth.
- After Export, a yellow box can say "Exported, but a check was not sure". It means an automatic check on the sound or colour could not be certain. Watch the video once before you post it.
- Mac with Apple Silicon and macOS 15 or later only. The app is not signed, which is why the first launch needs the steps in section 1.
- The **Batch** page is a placeholder for now. Videos are made one at a time.
- Deleting a clip file by hand inside the library folder can show an old thumbnail for up to an hour. The clip itself is still reported as missing.
