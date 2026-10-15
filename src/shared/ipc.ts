// IPC contract shared by main, preload and renderer. Types and constants only.

export const APP_VERSION_CHANNEL = "app:version";

export type SandwichApi = {
  app: {
    version: () => Promise<string>;
  };
};
