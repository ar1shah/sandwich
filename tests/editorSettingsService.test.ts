import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSettingsStore } from "../src/main/library/settings";
import { createEditorSettingsService } from "../src/main/settings/editorSettingsService";
import { makeTempDir } from "./helpers/db";

function setup(root: string | null = "/lib-a") {
  const file = path.join(makeTempDir(), "settings.json");
  const store = createSettingsStore(file);
  let current = root;
  const service = createEditorSettingsService({
    store,
    getRoot: () => current,
  });
  return {
    file,
    store,
    service,
    setRoot: (next: string | null) => {
      current = next;
    },
  };
}

describe("editorSettingsService", () => {
  it("returns defaults, then saved values (snapped)", async () => {
    const { service } = setup();
    expect((await service.get()).clipDurations).toEqual({
      before: 3,
      after: 4,
      broll: 5,
    });
    const result = await service.update({
      clipDurations: { before: 2.04, after: 3, broll: 4 },
      targetRange: { min: 8, max: 12 },
    });
    expect(result).toMatchObject({
      ok: true,
      value: { clipDurations: { before: 2 }, targetRange: { min: 8, max: 12 } },
    });
    expect((await service.get()).targetRange).toEqual({ min: 8, max: 12 });
  });

  it("rejects a payload with libraryPath and writes nothing", async () => {
    const { service, store, file } = setup();
    await store.write({ libraryPath: "/real" });
    const before = await readFile(file, "utf8");
    const result = await service.update({
      libraryPath: "/evil",
      targetRange: { min: 8, max: 12 },
    });
    expect(result.ok).toBe(false);
    expect(await readFile(file, "utf8")).toBe(before);
    expect((await store.read()).libraryPath).toBe("/real");
  });

  it("updating editor settings keeps libraryPath", async () => {
    const { service, store } = setup();
    await store.write({ libraryPath: "/real" });
    await service.update({ targetRange: { min: 8, max: 12 } });
    expect((await store.read()).libraryPath).toBe("/real");
  });

  it("a bad value in the file does not lose libraryPath", async () => {
    const { store, file, service } = setup();
    await writeFile(
      file,
      JSON.stringify({ libraryPath: "/real", clipDurations: { before: -5 } }),
    );
    expect((await store.read()).libraryPath).toBe("/real");
    expect((await service.get()).clipDurations.before).toBe(3);
  });

  it("keys the open draft by the active library", async () => {
    const { service, setRoot } = setup("/lib-a");
    expect(await service.getOpenDraft()).toBeNull();
    await service.setOpenDraft("draft-a");
    setRoot("/lib-b");
    expect(await service.getOpenDraft()).toBeNull();
    await service.setOpenDraft("draft-b");
    setRoot("/lib-a");
    expect(await service.getOpenDraft()).toBe("draft-a");
    await service.setOpenDraft(null);
    expect(await service.getOpenDraft()).toBeNull();
    setRoot("/lib-b");
    expect(await service.getOpenDraft()).toBe("draft-b");
  });

  it("setOpenDraft is a no-op without a library", async () => {
    const { service, setRoot, store } = setup();
    setRoot(null);
    await service.setOpenDraft("x");
    expect((await store.read()).openDrafts).toBeUndefined();
    expect(await service.getOpenDraft()).toBeNull();
  });
});
