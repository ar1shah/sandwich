import { create } from "zustand";
import {
  DEFAULT_EDITOR_SETTINGS,
  type EditorSettings,
  type UpdateEditorSettings,
} from "../../../shared/settings";

type SettingsStore = {
  settings: EditorSettings;
  loaded: boolean;
  load: () => Promise<EditorSettings>;
  // { ok: false } carries the first validation message.
  update: (
    patch: UpdateEditorSettings,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_EDITOR_SETTINGS,
  loaded: false,

  async load() {
    if (get().loaded) {
      return get().settings;
    }
    const settings = await window.api.settings.get();
    set({ settings, loaded: true });
    return settings;
  },

  async update(patch) {
    const result = await window.api.settings.update(patch);
    if (result.ok) {
      set({ settings: result.value, loaded: true });
      return { ok: true };
    }
    return result;
  },
}));
