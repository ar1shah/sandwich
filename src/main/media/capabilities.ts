import {
  buildCapabilityReport,
  parseEncoderNames,
  parseFilterNames,
  type CapabilityReport,
} from "../../shared/capabilitiesParse";
import { runCapture } from "./run";

export async function getFfCapabilities(
  ffmpegPath: string,
): Promise<CapabilityReport> {
  const [version, filters, encoders] = await Promise.all([
    runCapture(ffmpegPath, ["-hide_banner", "-version"]),
    runCapture(ffmpegPath, ["-hide_banner", "-filters"]),
    runCapture(ffmpegPath, ["-hide_banner", "-encoders"]),
  ]);

  return buildCapabilityReport({
    version: version.stdout.split("\n")[0]?.trim() ?? "unknown",
    filters: parseFilterNames(filters.stdout),
    encoders: parseEncoderNames(encoders.stdout),
  });
}
