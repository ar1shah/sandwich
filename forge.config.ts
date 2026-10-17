import { existsSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { ensureBrowser } from "@remotion/renderer";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { getCompositorPackage } from "./src/main/render/compositor-package";
import { getPackagedBrowserPaths } from "./src/main/render/packaged-browser";
import {
  bundleRemotionProject,
  getPrebuiltRemotionBundlePath,
} from "./src/main/render/remotion-bundle";
import { getBetterSqlitePrebuilds } from "./src/main/db/prebuilds";
import { getFfTarget, PACKAGED_FF_DIR } from "./src/main/media/binaries";
import { ensureFfBinaries } from "./scripts/ffmpeg/fetch";

const DARWIN_COMPOSITOR_PACKAGES = [
  "@remotion/compositor-darwin-x64",
  "@remotion/compositor-darwin-arm64",
];
const PACKAGE_BROWSER_ENV_VAR = "REMOTION_ELECTRON_PACKAGE_BROWSER";
// The headless browser ships inside the app by default (CLAUDE.md golden rule 7):
// no first-run download, no network dependency. Set the variable to "false" to skip it
// for a quick local build. See DECISIONS for the size tradeoff.
const shouldPackageBrowser = process.env[PACKAGE_BROWSER_ENV_VAR] !== "false";

// better-sqlite3's native binary must live outside app.asar (golden rule 7).
const SQLITE_PREBUILDS_DIR = "node_modules/better-sqlite3/prebuilds";

const DARWIN_UNIVERSAL_ARCH_FILES =
  "Contents/Resources/app.asar.unpacked/node_modules/@remotion/compositor-darwin-*/**";

function getCompositorPackagesForPackaging({
  arch,
  platform,
}: {
  arch: string;
  platform: string;
}): string[] {
  if (platform === "darwin") {
    return DARWIN_COMPOSITOR_PACKAGES;
  }

  return [getCompositorPackage({ arch, platform })];
}

function isMissingPackageError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "MODULE_NOT_FOUND"
  );
}

function shouldAllowMissingCompositorPackage({
  arch,
  compositorPackage,
  platform,
}: {
  arch: string;
  compositorPackage: string;
  platform: string;
}): boolean {
  if (platform !== "darwin" || arch === "universal") {
    return false;
  }

  return compositorPackage !== getCompositorPackage({ arch, platform });
}

function resolveInstalledCompositorPackageDirectory({
  allowMissing,
  compositorPackage,
}: {
  allowMissing: boolean;
  compositorPackage: string;
}): string | null {
  try {
    const compositorPackageJson = require.resolve(
      `${compositorPackage}/package.json`,
      {
        paths: [process.cwd()],
      },
    );

    return path.dirname(compositorPackageJson);
  } catch (error: unknown) {
    if (allowMissing && isMissingPackageError(error)) {
      return null;
    }

    throw error;
  }
}

async function stageCompositorPackages({
  arch,
  buildPath,
  platform,
}: {
  arch: string;
  buildPath: string;
  platform: string;
}): Promise<void> {
  const compositorPackages = getCompositorPackagesForPackaging({
    arch,
    platform,
  });

  for (const compositorPackage of compositorPackages) {
    const compositorSource = resolveInstalledCompositorPackageDirectory({
      allowMissing: shouldAllowMissingCompositorPackage({
        arch,
        compositorPackage,
        platform,
      }),
      compositorPackage,
    });

    if (!compositorSource) {
      continue;
    }

    const compositorDestination = path.join(
      buildPath,
      "node_modules",
      compositorPackage,
    );

    await mkdir(path.dirname(compositorDestination), { recursive: true });
    await cp(compositorSource, compositorDestination, { recursive: true });
  }
}

export async function stageBrowser({
  arch,
  buildPath,
  platform,
}: {
  arch: string;
  buildPath: string;
  platform: string;
}): Promise<void> {
  const browserPaths = getPackagedBrowserPaths({
    arch,
    buildPath,
    platform,
    projectRoot: process.cwd(),
  });

  if (!browserPaths) {
    return;
  }

  await ensureBrowser();
  if (!existsSync(browserPaths.downloadedBrowserFolder)) {
    return;
  }

  if (!browserPaths.packagedBrowserCopyDestination) {
    return;
  }

  await mkdir(path.dirname(browserPaths.packagedBrowserCopyDestination), {
    recursive: true,
  });

  await cp(
    browserPaths.downloadedBrowserFolder,
    browserPaths.packagedBrowserCopyDestination,
    { recursive: true },
  );
}

// Copies hash-verified ffmpeg + ffprobe for the target into <app>/ffmpeg-bin/<target>/,
// which is unpacked from asar so the binaries can be spawned.
async function stageFfBinaries({
  arch,
  buildPath,
  platform,
}: {
  arch: string;
  buildPath: string;
  platform: string;
}): Promise<void> {
  const target = getFfTarget(platform, arch);
  if (!target) {
    throw new Error(`No bundled FFmpeg for ${platform}-${arch}.`);
  }
  const source = await ensureFfBinaries({ projectRoot: process.cwd(), target });
  const destination = path.join(buildPath, PACKAGED_FF_DIR, target);
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true });
}

// The Forge Vite plugin leaves node_modules out of the app, so better-sqlite3 (external in
// vite.main.config.ts) is staged by hand: package.json + lib/ (its exports map and JS) and
// only the prebuilds/<platform>-<arch>.node file(s) for the target. lib/binding.js loads
// ../prebuilds/<platform>-<arch>.node relative to itself, so this layout is exact.
// node-addon-api is a compile-time dependency and is not needed.
async function stageBetterSqlite3({
  arch,
  buildPath,
  platform,
}: {
  arch: string;
  buildPath: string;
  platform: string;
}): Promise<void> {
  const packageJson = require.resolve("better-sqlite3/package.json", {
    paths: [process.cwd()],
  });
  const source = path.dirname(packageJson);
  const destination = path.join(buildPath, "node_modules", "better-sqlite3");
  await mkdir(path.join(destination, "prebuilds"), { recursive: true });
  await cp(packageJson, path.join(destination, "package.json"));
  await cp(path.join(source, "lib"), path.join(destination, "lib"), {
    recursive: true,
  });
  for (const file of getBetterSqlitePrebuilds({ arch, platform })) {
    await cp(
      path.join(source, "prebuilds", file),
      path.join(destination, "prebuilds", file),
    );
  }
}

const config = {
  packagerConfig: {
    asar: {
      unpackDir: shouldPackageBrowser
        ? `{node_modules/@remotion/compositor-*,remotion-browser,${PACKAGED_FF_DIR},${SQLITE_PREBUILDS_DIR}}`
        : `{node_modules/@remotion/compositor-*,${PACKAGED_FF_DIR},${SQLITE_PREBUILDS_DIR}}`,
    },
    osxUniversal: {
      // These compositor binaries are already architecture-specific and should not be
      // merged with lipo during universal packaging.
      x64ArchFiles: DARWIN_UNIVERSAL_ARCH_FILES,
    },
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: async (
      _forgeConfig: unknown,
      buildPath: string,
      _electronVersion: string,
      platform: string,
      arch: string,
    ) => {
      await bundleRemotionProject({
        projectRoot: process.cwd(),
        outDir: getPrebuiltRemotionBundlePath(buildPath),
      });

      // Chrome Headless Shell is packaged into the app by default (set
      // REMOTION_ELECTRON_PACKAGE_BROWSER=false to skip it). This increases the final
      // app size significantly, but packaged renders can run completely offline.
      // IMPORTANT: This is not supported for macOS universal builds.
      // `ensureBrowser()` only downloads a browser for the current architecture,
      // so the other packaged architecture would not get an offline browser.
      // For universal builds, prefer calling `ensureBrowser()` at runtime instead.
      if (shouldPackageBrowser) {
        await stageBrowser({
          arch,
          buildPath,
          platform,
        });
      }

      // Electron Forge's Vite packaging does not materialize this optional runtime binary
      // into the packaged app automatically, so stage the required compositor packages explicitly.
      await stageCompositorPackages({
        arch,
        buildPath,
        platform,
      });

      await stageFfBinaries({
        arch,
        buildPath,
        platform,
      });

      await stageBetterSqlite3({
        arch,
        buildPath,
        platform,
      });
    },
  },
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
  ],
};

export default config;
