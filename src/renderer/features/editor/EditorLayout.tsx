import { Thumb } from "../../components/Thumb";
import { useState } from "react";
import { exportBlocker } from "../../../shared/exportBlocker";
import { SLOTS } from "../../../shared/recipe";
import { BrollPicker } from "../broll/BrollPicker";
import { productImageUrl } from "../products/productImageUrl";
import { useProductsStore } from "../products/productsStore";
import { PreviewPanel } from "../preview/PreviewPanel";
import { ClipPanel } from "../trim/ClipPanel";
import { useEditorStore } from "./editorStore";
import { ExportPanel } from "./ExportPanel";
import { SlotCard } from "./SlotCard";

// Three columns: slots (left), preview (center), clip panel (right: trim in 3.3, then 3.4).
export const EditorLayout: React.FC = () => {
  const draft = useEditorStore((s) => s.draft);
  const product = useEditorStore((s) => s.product);
  const notice = useEditorStore((s) => s.notice);
  const saveError = useEditorStore((s) => s.saveError);
  const closeDraft = useEditorStore((s) => s.closeDraft);
  const exportVideo = useEditorStore((s) => s.exportVideo);
  const exportState = useEditorStore((s) => s.exportState);
  const pending = useEditorStore((s) => s.pending);
  const missing = useEditorStore((s) => s.missing);
  const setBroll = useEditorStore((s) => s.setBroll);
  const dismissNotice = useEditorStore((s) => s.dismissNotice);
  const mediaBase = useProductsStore((s) => s.mediaBase);
  const [pickingBroll, setPickingBroll] = useState(false);

  if (!draft || !product) {
    return null;
  }
  const image = productImageUrl(mediaBase, product);
  const blocker = exportBlocker({
    draft,
    pendingSlots: SLOTS.filter((slot) => pending[slot]),
    missingSlots: SLOTS.filter((slot) => missing[slot]),
  });

  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3">
        <Thumb
          src={image}
          className="h-10 w-10 rounded-md object-cover"
          fallback={null}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{product.fullName}</p>
          <p className="text-xs text-app-muted">Draft saves automatically.</p>
        </div>
        <button
          type="button"
          onClick={() => void exportVideo()}
          disabled={blocker !== null || exportState.kind !== "idle"}
          title={blocker ?? "Render this video and save it to your library"}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Export
        </button>
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

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_300px] min-[1300px]:grid-cols-[320px_minmax(0,1fr)_360px] gap-6">
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

        <PreviewPanel />

        <ClipPanel />
      </div>

      <ExportPanel />

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
