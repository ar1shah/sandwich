// Parses `ffmpeg -filters` / `ffmpeg -encoders` output and checks what the app needs.

export const REQUIRED_FILTERS = [
  "zscale",
  "tonemap",
  "scale",
  "fps",
  "transpose",
  "crop",
  "pad",
  "tile",
  "format",
] as const;
export const REQUIRED_ENCODERS = ["libx264", "aac"] as const;
export const OPTIONAL_ENCODERS = ["h264_videotoolbox"] as const;
// Reported only; used to pick the HDR tone map path in Step 1.2.
export const OPTIONAL_FILTERS = ["libplacebo", "colorspace"] as const;

// Filter lines look like: " TSC zscale            V->V       Apply resizing..."
const FILTER_LINE = /^\s[TSC.|]{3}\s+(\S+)\s+\S*->\S*/;
// Encoder lines look like: " V....D libx264              libx264 H.264 ..."
const ENCODER_LINE = /^\s([VAS][A-Z.]{5})\s+(\S+)\s/;

export function parseFilterNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = FILTER_LINE.exec(line);
    if (match?.[1]) {
      names.add(match[1]);
    }
  }
  return names;
}

export function parseEncoderNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = ENCODER_LINE.exec(line);
    // The legend (" V..... = Video") matches the shape but its name is "=".
    if (match?.[2] && match[2] !== "=") {
      names.add(match[2]);
    }
  }
  return names;
}

export type CapabilityReport = {
  version: string;
  filters: Record<string, boolean>;
  encoders: Record<string, boolean>;
  missingRequired: string[];
  ok: boolean;
};

export function buildCapabilityReport({
  version,
  filters,
  encoders,
}: {
  version: string;
  filters: Set<string>;
  encoders: Set<string>;
}): CapabilityReport {
  const filterStatus: Record<string, boolean> = {};
  for (const name of [...REQUIRED_FILTERS, ...OPTIONAL_FILTERS]) {
    filterStatus[name] = filters.has(name);
  }
  const encoderStatus: Record<string, boolean> = {};
  for (const name of [...REQUIRED_ENCODERS, ...OPTIONAL_ENCODERS]) {
    encoderStatus[name] = encoders.has(name);
  }
  const missingRequired = [
    ...REQUIRED_FILTERS.filter((name) => !filters.has(name)).map(
      (name) => `filter ${name}`,
    ),
    ...REQUIRED_ENCODERS.filter((name) => !encoders.has(name)).map(
      (name) => `encoder ${name}`,
    ),
  ];

  return {
    version,
    filters: filterStatus,
    encoders: encoderStatus,
    missingRequired,
    ok: missingRequired.length === 0,
  };
}

export function formatCapabilityReport(report: CapabilityReport): string {
  const mark = (present: boolean | undefined) => (present ? "yes" : "NO");
  const lines = [`FFmpeg: ${report.version}`];
  for (const name of REQUIRED_FILTERS) {
    lines.push(`  filter  ${name.padEnd(18)} ${mark(report.filters[name])}`);
  }
  for (const name of OPTIONAL_FILTERS) {
    lines.push(
      `  filter  ${name.padEnd(18)} ${mark(report.filters[name])} (optional)`,
    );
  }
  for (const name of REQUIRED_ENCODERS) {
    lines.push(`  encoder ${name.padEnd(18)} ${mark(report.encoders[name])}`);
  }
  for (const name of OPTIONAL_ENCODERS) {
    lines.push(
      `  encoder ${name.padEnd(18)} ${mark(report.encoders[name])} (optional)`,
    );
  }
  lines.push(
    report.ok
      ? "All required capabilities present."
      : `Missing required: ${report.missingRequired.join(", ")}`,
  );
  return lines.join("\n");
}
