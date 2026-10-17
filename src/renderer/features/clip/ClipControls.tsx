import { isZoomOn } from "../../../shared/editorRecipe";
import { SLOTS, type Slot } from "../../../shared/recipe";
import { useEditorStore } from "../editor/editorStore";
import { usePreviewStore } from "../preview/previewStore";

const Switch: React.FC<{
  label: string;
  hint: string;
  testId: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, hint, testId, checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    data-testid={testId}
    onClick={() => onChange(!checked)}
    className="flex flex-1 items-center justify-between gap-3 rounded-md border border-edge px-3 py-2 text-left transition-colors hover:bg-white/5"
  >
    <span className="flex flex-col">
      <span className="text-sm">{label}</span>
      <span className="text-xs text-app-muted">{hint}</span>
    </span>
    <span
      aria-hidden
      className={
        "relative h-5 w-9 shrink-0 rounded-full transition-colors " +
        (checked ? "bg-brand" : "bg-white/15")
      }
    >
      <span
        className={
          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all " +
          (checked ? "left-[18px]" : "left-0.5")
        }
      />
    </span>
  </button>
);

// Zoom (on = slow push) and mute for the selected clip. Turning zoom on jumps the preview
// to the end of the clip and pauses, where the push is strongest; the other changes leave
// the playhead alone.
export const ClipControls: React.FC<{ slot: Slot }> = ({ slot }) => {
  const clip = useEditorStore((s) => s.draft?.clips[SLOTS.indexOf(slot)]);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setMuted = useEditorStore((s) => s.setMuted);
  const requestSeek = usePreviewStore((s) => s.requestSeek);
  if (!clip) {
    return null;
  }

  return (
    <section aria-label="Zoom and sound" className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-app-muted">
        Clip
      </h3>
      <div className="flex gap-2">
        <Switch
          label="Zoom"
          hint="Slow push"
          testId="zoom-toggle"
          checked={isZoomOn(clip)}
          onChange={(on) => {
            setZoom(slot, on);
            if (on) {
              requestSeek({ slot, edge: "end" }, { pause: true });
            }
          }}
        />
        <Switch
          label="Mute"
          hint={clip.muted ? "Sound off" : "Sound on"}
          testId="mute-toggle"
          checked={clip.muted}
          onChange={(muted) => setMuted(slot, muted)}
        />
      </div>
    </section>
  );
};
