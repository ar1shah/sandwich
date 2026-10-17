import {
  resolveEditorSettings,
  UpdateEditorSettingsSchema,
  type EditorSettings,
} from "../../shared/settings";
import type { SettingsStore } from "../library/settings";

export type EditorSettingsDeps = {
  store: SettingsStore;
  // The active library root (null = none open). Open-draft ids are keyed by it.
  getRoot: () => string | null;
};

export type UpdateResult =
  | { ok: true; value: EditorSettings }
  | { ok: false; message: string };

// Editor-facing view of settings.json. It can change the clip lengths, the target range
// and the open-draft pointer, and nothing else: libraryPath is owned by the library
// manager (DECISIONS #28). No Electron imports.
export function createEditorSettingsService(deps: EditorSettingsDeps) {
  // settings.json is read-modify-written, so writes from here go one at a time.
  let chain: Promise<unknown> = Promise.resolve();
  function serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  }

  async function get(): Promise<EditorSettings> {
    return resolveEditorSettings(await deps.store.read());
  }

  return {
    get,

    update(patch: unknown): Promise<UpdateResult> {
      const parsed = UpdateEditorSettingsSchema.safeParse(patch);
      if (!parsed.success) {
        return Promise.resolve({
          ok: false,
          message: parsed.error.issues[0]?.message ?? "Check the settings.",
        });
      }
      return serialized(async () => {
        await deps.store.write(parsed.data);
        return { ok: true as const, value: await get() };
      });
    },

    async getOpenDraft(): Promise<string | null> {
      const root = deps.getRoot();
      if (!root) {
        return null;
      }
      return (await deps.store.read()).openDrafts?.[root] ?? null;
    },

    setOpenDraft(draftId: string | null): Promise<void> {
      const root = deps.getRoot();
      if (!root) {
        return Promise.resolve();
      }
      return serialized(async () => {
        const openDrafts = { ...(await deps.store.read()).openDrafts };
        if (draftId === null) {
          delete openDrafts[root];
        } else {
          openDrafts[root] = draftId;
        }
        await deps.store.write({ openDrafts });
      });
    },
  };
}

export type EditorSettingsService = ReturnType<
  typeof createEditorSettingsService
>;
