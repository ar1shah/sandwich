import { useEffect, useState } from "react";
import {
  CLIP_DURATION_MAX,
  CLIP_DURATION_MIN,
  defaultsOutsideTarget,
  defaultTotal,
  snapSeconds,
  UpdateEditorSettingsSchema,
  type EditorSettings,
} from "../../../shared/settings";
import { SLOTS, type Slot } from "../../../shared/recipe";
import { SLOT_LABELS } from "../editor/SlotCard";
import { useSettingsStore } from "./settingsStore";

type Fields = Record<Slot | "min" | "max", string>;

function toFields(settings: EditorSettings): Fields {
  return {
    before: String(settings.clipDurations.before),
    after: String(settings.clipDurations.after),
    broll: String(settings.clipDurations.broll),
    min: String(settings.targetRange.min),
    max: String(settings.targetRange.max),
  };
}

const INPUT =
  "w-24 rounded-md border border-edge bg-app px-3 py-2 text-sm outline-none focus:border-brand";

// Default clip lengths and the target total. New drafts use them; drafts already in
// progress keep the lengths they have.
export const EditorSettingsSection: React.FC = () => {
  const saved = useSettingsStore((s) => s.settings);
  const load = useSettingsStore((s) => s.load);
  const update = useSettingsStore((s) => s.update);
  const [fields, setFields] = useState<Fields>(toFields(saved));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  useEffect(() => {
    load()
      .then((settings) => setFields(toFields(settings)))
      .catch((caught: unknown) =>
        setMessage({
          ok: false,
          text: `Could not load your settings: ${caught instanceof Error ? caught.message : String(caught)}`,
        }),
      );
  }, [load]);

  const parsed = UpdateEditorSettingsSchema.safeParse({
    clipDurations: {
      before: Number(fields.before),
      after: Number(fields.after),
      broll: Number(fields.broll),
    },
    targetRange: { min: Number(fields.min), max: Number(fields.max) },
  });
  const blank = Object.values(fields).some((value) => value.trim() === "");
  const error = blank
    ? "Fill in every length."
    : parsed.success
      ? null
      : (parsed.error.issues[0]?.message ?? "Check the numbers.");
  // What would be saved, to warn before saving.
  const preview: EditorSettings | null =
    parsed.success && parsed.data.clipDurations && parsed.data.targetRange
      ? {
          clipDurations: parsed.data.clipDurations,
          targetRange: parsed.data.targetRange,
        }
      : null;
  const warn = !error && preview !== null && defaultsOutsideTarget(preview);

  function set(key: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  async function save() {
    if (!parsed.success || error) {
      return;
    }
    const result = await update(parsed.data);
    if (result.ok) {
      const next = useSettingsStore.getState().settings;
      setFields(toFields(next));
      setMessage({ ok: true, text: "Saved." });
    } else {
      setMessage({ ok: false, text: result.message });
    }
  }

  return (
    <section
      aria-label="Video defaults"
      className="mt-6 max-w-2xl rounded-xl border border-edge bg-panel p-6"
    >
      <h2 className="text-lg font-medium">Video defaults</h2>
      <p className="mt-1 text-sm text-app-muted">
        New drafts start with these lengths. Drafts already in progress keep
        theirs. Values snap to 0.1 s.
      </p>

      <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-app-dim">
        Clip lengths (seconds)
      </h3>
      <div className="mt-2 flex flex-wrap gap-4">
        {SLOTS.map((slot) => (
          <label key={slot} className="text-sm">
            <span className="block text-app-muted">{SLOT_LABELS[slot]}</span>
            <input
              type="number"
              inputMode="decimal"
              step={0.1}
              min={CLIP_DURATION_MIN}
              max={CLIP_DURATION_MAX}
              value={fields[slot]}
              onChange={(event) => set(slot, event.target.value)}
              onBlur={() => {
                const n = Number(fields[slot]);
                if (fields[slot].trim() !== "" && Number.isFinite(n)) {
                  set(slot, String(snapSeconds(n)));
                }
              }}
              aria-label={`${SLOT_LABELS[slot]} length`}
              className={`${INPUT} mt-1`}
            />
          </label>
        ))}
      </div>

      <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-app-dim">
        Target total (seconds)
      </h3>
      <div className="mt-2 flex flex-wrap gap-4">
        <label className="text-sm">
          <span className="block text-app-muted">Shortest</span>
          <input
            type="number"
            inputMode="decimal"
            step={0.1}
            value={fields.min}
            onChange={(event) => set("min", event.target.value)}
            aria-label="Target total shortest"
            className={`${INPUT} mt-1`}
          />
        </label>
        <label className="text-sm">
          <span className="block text-app-muted">Longest</span>
          <input
            type="number"
            inputMode="decimal"
            step={0.1}
            value={fields.max}
            onChange={(event) => set("max", event.target.value)}
            aria-label="Target total longest"
            className={`${INPUT} mt-1`}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {error}
        </p>
      )}
      {warn && preview && (
        <p
          role="note"
          className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          Three default clips add up to {defaultTotal(preview)} s, outside the
          target of {preview.targetRange.min} to {preview.targetRange.max} s.
          You can still save.
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={error !== null}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Save defaults
        </button>
        {message && (
          <span
            role="status"
            className={
              message.ok ? "text-sm text-app-muted" : "text-sm text-red-400"
            }
          >
            {message.text}
          </span>
        )}
      </div>
    </section>
  );
};
