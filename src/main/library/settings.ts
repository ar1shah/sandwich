import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppSettingsSchema, type AppSettings } from "../../shared/library";

export type SettingsStore = {
  read: () => Promise<AppSettings>;
  write: (patch: Partial<AppSettings>) => Promise<void>;
};

// <userData>/settings.json. A missing, unreadable or invalid file reads as "no settings"
// (the welcome screen shows again) rather than crashing the app on launch.
export function createSettingsStore(file: string): SettingsStore {
  async function read(): Promise<AppSettings> {
    try {
      const parsed = AppSettingsSchema.safeParse(
        JSON.parse(await readFile(file, "utf8")),
      );
      return parsed.success ? parsed.data : {};
    } catch {
      return {};
    }
  }

  return {
    read,
    async write(patch) {
      const next = { ...(await read()), ...patch };
      await mkdir(path.dirname(file), { recursive: true });
      // Write then rename so a crash never leaves a half-written settings file.
      const temp = `${file}.tmp`;
      await writeFile(temp, JSON.stringify(next, null, 2));
      await rename(temp, file);
    },
  };
}
