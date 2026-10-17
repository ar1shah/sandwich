// Keyboard navigation over a grid laid out row by row. Pure.

export type GridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

// The index to focus after `key`, staying inside the grid (no wrap). `current` of -1 means
// nothing is focused yet: any arrow goes to the first item. Returns -1 for an empty grid.
export function nextGridIndex(
  current: number,
  key: GridKey,
  count: number,
  columns: number,
): number {
  if (count <= 0) {
    return -1;
  }
  const cols = Math.max(1, Math.floor(columns));
  if (current < 0 || current >= count) {
    return 0;
  }
  switch (key) {
    case "ArrowLeft":
      return Math.max(0, current - 1);
    case "ArrowRight":
      return Math.min(count - 1, current + 1);
    case "ArrowUp":
      return current - cols >= 0 ? current - cols : current;
    case "ArrowDown":
      // A short last row: land on its last item instead of staying put.
      if (current + cols < count) {
        return current + cols;
      }
      return Math.floor(current / cols) < Math.floor((count - 1) / cols)
        ? count - 1
        : current;
  }
}
