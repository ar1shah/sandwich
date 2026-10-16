// Parses ffmpeg `-progress pipe:1` output: blocks of `key=value` lines, each block ended
// by `progress=continue` or `progress=end`. Pure: feed it stdout chunks as they arrive.

export type ProgressUpdate = {
  percent: number; // 0..100
  outTimeSeconds: number;
  done: boolean;
};

export type ProgressParser = {
  push(chunk: string): ProgressUpdate[];
};

// "00:00:03.500000" -> 3.5. Returns null for "N/A" and anything unparseable.
export function parseClockTime(value: string): number | null {
  const match = /^(-?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const seconds =
    Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4]);
  return match[1] ? -seconds : seconds;
}

function parseMicroseconds(value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) {
    return null; // "N/A" before the first frame is written
  }
  return Number(value) / 1_000_000;
}

// `out_time_us` and `out_time_ms` are both microseconds (ffmpeg's `_ms` is a long-standing
// misnomer). `out_time` is the human-readable form and the last resort.
function readOutTime(key: string, value: string): number | null {
  if (key === "out_time_us" || key === "out_time_ms") {
    return parseMicroseconds(value);
  }
  if (key === "out_time") {
    return parseClockTime(value);
  }
  return null;
}

export function createProgressParser(durationSeconds: number): ProgressParser {
  let pending = "";
  let outTime = 0;

  const percentOf = (seconds: number): number => {
    if (!(durationSeconds > 0)) {
      return 0;
    }
    return Math.min(100, Math.max(0, (seconds / durationSeconds) * 100));
  };

  return {
    push(chunk: string): ProgressUpdate[] {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      // The last piece may be a partial line; keep it for the next chunk.
      pending = lines.pop() ?? "";
      const updates: ProgressUpdate[] = [];

      for (const line of lines) {
        const separator = line.indexOf("=");
        if (separator < 0) {
          continue;
        }
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1);

        const seconds = readOutTime(key, value);
        if (seconds !== null) {
          outTime = Math.max(0, seconds);
        } else if (key === "progress") {
          const done = value.trim() === "end";
          updates.push({
            percent: done ? 100 : percentOf(outTime),
            outTimeSeconds: outTime,
            done,
          });
        }
      }
      return updates;
    },
  };
}
