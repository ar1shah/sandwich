import { useState } from "react";
import { formatDuration } from "../../../shared/formatDuration";
import { SLOTS, totalDuration } from "../../../shared/recipe";
import { BrollPicker } from "../broll/BrollPicker";
import { productImageUrl } from "../products/productImageUrl";
import { useProductsStore } from "../products/productsStore";
import { useSettingsStore } from "../settings/settingsStore";
import { useEditorStore } from "./editorStore";
import { SLOT_LABELS, SlotCard } from "./SlotCard";

// Three columns: slots (left), preview (center, step 3.2), clip panel (right, steps
// 3.3 and 3.4).
export const EditorLayout: React.FC = () => {
  const draft = useEditorStore((s) => s.draft);
  const product = useEditorStore((s) => s.product);
  const selectedSlot = useEditorStore((s) => s.selectedSlot);
  const notice = useEditorStore((s) => s.notice);
  const saveError = useEditorStore((s) => s.saveError);
  const closeDraft = useEditorStore((s) => s.closeDraft);
  const setBroll = useEditorStore((s) => s.setBroll);
  const dismissNotice = useEditorStore((s) => s.dismissNotice);
  const mediaBase = useProductsStore((s) => s.mediaBase);
  const range = useSettingsStore((s) => s.settings.targetRange);
  const [pickingBroll, setPickingBroll] = useState(false);

  if (!draft || !product) {
    return null;
  }
  const total = totalDuration(draft);
  const image = productImageUrl(mediaBase, product);

  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3">
        {image && (
          <img
            src={image}
            alt=""
            className="h-10 w-10 rounded-md object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{product.fullName}</p>
          <p className="text-xs text-app-muted">Draft saves automatically.</p>
        </div>
        <button
          type="button"
          onClick={() => void closeDraft()}
          className="rounded-md border border-edge px-4 py-2 text-sm transition-colors hover:bg-white/5"
        >
          Close draft
        </button>
      </div>

      {notice && (
        <p
          role="status"
          className="mt-3 text-sm text-app-muted"
          onClick={dismissNotice}
        >
          {notice}
        </p>
      )}
      {saveError && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          Could not save the draft: {saveError}
        </p>
      )}

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_280px] gap-6">
        <ul aria-label="Slots" className="space-y-3 overflow-y-auto">
          {SLOTS.map((slot) => (
            <SlotCard
              key={slot}
              slot={slot}
              mediaBase={mediaBase}
              onPickBroll={() => setPickingBroll(true)}
            />
          ))}
        </ul>

        <section
          aria-label="Preview"
          className="grid place-items-center rounded-xl border border-dashed border-edge p-6 text-center"
        >
          <div>
            <p className="text-sm text-app-muted">
              The live preview arrives in the next step.
            </p>
            <p
              className="mt-3 text-2xl font-semibold"
              data-testid="total-length"
            >
              {formatDuration(total)}
            </p>
            <p className="text-xs text-app-dim">
              Target {range.min} to {range.max} s
            </p>
          </div>
        </section>

        <aside
          aria-label="Clip panel"
          className="rounded-xl border border-edge bg-panel p-4"
        >
          <h2 className="text-sm font-medium">
            {selectedSlot ? SLOT_LABELS[selectedSlot] : "Clip"}
          </h2>
          <p className="mt-2 text-sm text-app-muted">
            {selectedSlot
              ? "Trim, zoom, mute and captions for this clip arrive in the next steps."
              : "Select a slot to edit its clip."}
          </p>
        </aside>
      </div>

      {pickingBroll && (
        <BrollPicker
          productId={product.id}
          onSelect={(media) => {
            setBroll(media);
            setPickingBroll(false);
          }}
          onClose={() => setPickingBroll(false)}
        />
      )}
    </div>
  );
};
