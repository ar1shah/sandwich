import { parseProbeJson, type ProbeResult } from "../../shared/probeParse";
import { runCapture } from "./run";

export async function probeFile(
  ffprobePath: string,
  filePath: string,
): Promise<ProbeResult> {
  const { stdout } = await runCapture(ffprobePath, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  return parseProbeJson(JSON.parse(stdout));
}
