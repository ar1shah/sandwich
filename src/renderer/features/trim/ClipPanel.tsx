import { SLOTS } from "../../../shared/recipe";
import { slotStatus } from "../../../shared/editorRecipe";
import { SLOT_LABELS } from "../editor/SlotCard";
import { useEditorStore } from "../editor/editorStore";
import { CaptionSection } from "../clip/CaptionSection";
import { ClipControls } from "../clip/ClipControls";
import { TrimSection } from "./TrimSection";

// Right column: the selected slot's clip: trim, zoom and mute, caption.
export const ClipPanel: React.FC = () => {
  const selected = useEditorStore((s) => s.selectedSlot);
  const clip = useEditorStore((s) =>
    s.selectedSlot ? s.draft?.clips[SLOTS.indexOf(s.selectedSlot)] : undefined,
  );
  const importing = useEditorStore(
    (s) => s.selectedSlot !== null && s.pending[s.selectedSlot] !== undefined,
  );
  const failed = useEditorStore(
    (s) => s.selectedSlot !== null && s.slotError[s.selectedSlot] !== undefined,
  );
  const missing = useEditorStore(
    (s) => s.selectedSlot !== null && s.missing[s.selectedSlot] === true,
  );

  const status =
    selected && clip
      ? slotStatus(clip, { importing, error: failed, missing })
      : null;

  let body: React.ReactNode;
  if (!selected || !clip || !status) {
    body = (
      <p className="text-sm text-app-muted">Select a slot to edit its clip.</p>
    );
  } else if (status === "ready") {
    const key = `${selected}:${clip.mediaPath}`;
    body = (
      <>
        <TrimSection key={`trim:${key}`} slot={selected} />
        <ClipControls key={`controls:${key}`} slot={selected} />
        <CaptionSection key={`caption:${key}`} slot={selected} />
      </>
    );
  } else {
    const messages = {
      empty: "Add a clip to this slot to trim it.",
      importing: "Importing. You can trim once it is ready.",
      error: "This clip could not be imported.",
      missing: "This clip is missing from the library.",
    } as const;
    body = <p className="text-sm text-app-muted">{messages[status]}</p>;
  }

  return (
    <aside
      aria-label="Clip panel"
      className="min-h-0 space-y-4 overflow-y-auto rounded-xl border border-edge bg-panel p-4"
    >
      <h2 className="text-sm font-medium">
        {selected ? SLOT_LABELS[selected] : "Clip"}
      </h2>
      {body}
    </aside>
  );
};
