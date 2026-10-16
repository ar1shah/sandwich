// Batch intake pairing (docs/reference/SPEC.md section 5.2). Each function returns pairs
// (before, after) as rows plus whatever could not be paired. The pairing board is the final check.

export type PairRow<T> = { before: T; after: T };
export type PairResult<T> = { rows: PairRow<T>[]; leftovers: T[] };

export type DatedFile = {
  recordedAt: string | null; // ISO from ffprobe (ProbeResult.recordedAt), may be missing
  mtimeMs: number; // file modified time, always available
};

function pairConsecutive<T>(files: readonly T[]): PairResult<T> {
  const rows: PairRow<T>[] = [];
  for (let i = 0; i + 1 < files.length; i += 2) {
    rows.push({ before: files[i] as T, after: files[i + 1] as T });
  }
  return {
    rows,
    leftovers: files.length % 2 === 1 ? [files[files.length - 1] as T] : [],
  };
}

// "In order" mode: files arrive as before1, after1, before2, after2, ...
export function pairInOrder<T>(files: readonly T[]): PairResult<T> {
  return pairConsecutive(files);
}

// "All at once" mode: sort by recording time, then pair consecutive clips.
export function recordedTime(file: DatedFile): number {
  if (file.recordedAt !== null) {
    const parsed = Date.parse(file.recordedAt);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return file.mtimeMs;
}

export function pairByDate<T extends DatedFile>(
  files: readonly T[],
): PairResult<T> {
  // Array.prototype.sort is stable, so equal times keep input order.
  const sorted = files
    .slice()
    .sort((a, b) => recordedTime(a) - recordedTime(b));
  return pairConsecutive(sorted);
}

// "Two drop zones" mode: befores and afters paired top to bottom.
export function pairTwoColumns<T>(
  befores: readonly T[],
  afters: readonly T[],
): PairResult<T> {
  const count = Math.min(befores.length, afters.length);
  const rows: PairRow<T>[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({ before: befores[i] as T, after: afters[i] as T });
  }
  return {
    rows,
    leftovers: [...befores.slice(count), ...afters.slice(count)],
  };
}
