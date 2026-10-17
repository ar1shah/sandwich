import { writeFileSync } from "node:fs";
import type { ImportSteps } from "../../src/main/jobs/importClip";
import { AbortError } from "../../src/main/media/run";
import { makeProbe } from "./probe";

export type StepName = "normalize" | "thumbnail" | "filmstrip";

// Fake ffmpeg steps that write small real files at the paths they are given. `failAt`
// makes one step throw; `abortAt` makes it wait for the abort signal like a killed child.
export function fakeSteps(
  options: {
    failAt?: StepName;
    abortAt?: StepName;
    onStep?: (name: StepName) => void;
  } = {},
): ImportSteps {
  const reach = async (name: StepName, signal: AbortSignal) => {
    options.onStep?.(name);
    if (options.failAt === name) {
      throw new Error(`${name} failed`);
    }
    if (options.abortAt === name) {
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
        }
        signal.addEventListener("abort", () => resolve());
      });
      throw new AbortError();
    }
  };
  return {
    normalize: async (_input, output, { signal, onProgress }) => {
      await reach("normalize", signal);
      writeFileSync(output, "mp4 bytes");
      onProgress(50);
      onProgress(100);
      return {
        probe: makeProbe({ recordedAt: "2026-10-01T10:00:00Z", isHdr: true }),
        outputProbe: makeProbe({
          duration: 4.5,
          displayWidth: 1080,
          displayHeight: 1920,
        }),
        wasHdr: true,
      };
    },
    thumbnail: async (_video, jpg, { signal }) => {
      await reach("thumbnail", signal);
      writeFileSync(jpg, "thumb bytes");
    },
    filmstrip: async (_video, jpg, { signal }) => {
      await reach("filmstrip", signal);
      writeFileSync(jpg, "strip bytes");
      return { path: jpg };
    },
  };
}
