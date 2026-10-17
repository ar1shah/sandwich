import { useMemo } from "react";
import { formatDuration } from "../../../shared/formatDuration";
import {
  lengthStatus,
  slotBreakdown,
  totalSeconds,
} from "../../../shared/lengthStatus";
import { SLOTS, type Recipe } from "../../../shared/recipe";
import { useSettingsStore } from "../settings/settingsStore";

const TONE = {
  "in-range": "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  short: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  long: "border-amber-400/40 bg-amber-400/10 text-amber-300",
} as const;

// Total length of the exported file (frame count over fps, the render's own math), green
// inside the target range and amber outside, with the per-slot breakdown.
export const LengthIndicator: React.FC<{ recipe: Recipe }> = ({ recipe }) => {
  const range = useSettingsStore((s) => s.settings.targetRange);
  const total = useMemo(
    () => totalSeconds(recipe, recipe.output.fps),
    [recipe],
  );
  const status = lengthStatus(total, range);
  const parts = slotBreakdown(recipe);

  const note =
    status.state === "short"
      ? `${formatDuration(status.gap)} short of the target`
      : status.state === "long"
        ? `${formatDuration(status.gap)} over the target`
        : "Inside the target";

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-center ${TONE[status.state]}`}
      data-state={status.state}
      data-testid="length-indicator"
    >
      <p className="text-2xl font-semibold" data-testid="total-length">
        {formatDuration(total)}
      </p>
      <p className="text-xs">
        {note} · {range.min} to {range.max} s
      </p>
      <p
        className="mt-1 text-xs opacity-80"
        aria-label="Length per slot"
        data-testid="length-breakdown"
      >
        {SLOTS.map((slot) => formatDuration(parts[slot])).join(" + ")}
      </p>
    </div>
  );
};
