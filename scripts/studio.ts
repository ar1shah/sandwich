// npm run studio
//
// Remotion Studio on the Sandwich composition, loaded with fixtures/sample.recipe.json.
// Serves fixtures/ through the real media server and hands the props to Studio in
// out/studio-props.json. That file holds the session token (out/ is gitignored); the base
// URL is never printed (DECISIONS #25).
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  loadSampleProps,
  PROJECT_ROOT,
  startFixturesServer,
} from "./sandwich/sampleProps";

async function main(): Promise<void> {
  const server = await startFixturesServer();
  let child: ReturnType<typeof spawn> | null = null;

  try {
    const propsPath = path.join(PROJECT_ROOT, "out", "studio-props.json");
    await mkdir(path.dirname(propsPath), { recursive: true });
    await writeFile(
      propsPath,
      JSON.stringify(await loadSampleProps(server.baseUrl), null, 2),
    );
    console.log(`[studio] media server on port ${server.port}`);

    // process.execPath + the CLI script, not node_modules/.bin/remotion: the .bin entry is
    // a .cmd file on Windows, which Node will not spawn without a shell.
    const cli = path.join(
      path.dirname(require.resolve("@remotion/cli/package.json")),
      "remotion-cli.js",
    );
    child = spawn(
      process.execPath,
      [
        cli,
        "studio",
        path.join("remotion", "index.ts"),
        `--props=${path.join("out", "studio-props.json")}`,
      ],
      { cwd: PROJECT_ROOT, stdio: "inherit" },
    );
  } catch (error) {
    await server.close();
    throw error;
  }

  const running = child;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      running.kill(signal);
    });
  }

  const code = await new Promise<number>((resolve) => {
    running.on("exit", (exitCode, signal) => {
      resolve(exitCode ?? (signal ? 130 : 1));
    });
    running.on("error", (error) => {
      console.error(`[studio] could not start Remotion: ${error.message}`);
      resolve(1);
    });
  });
  await server.close();
  process.exit(code);
}

main().catch((error: unknown) => {
  console.error(
    `[studio] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
