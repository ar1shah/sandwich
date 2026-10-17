import { useId, useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { CAPTION_SLOTS, type CaptionSlot } from "../../../shared/captionFilter";
import {
  CAPTION_SLOT_LABELS,
  CAPTION_TEXT_MAX,
  CaptionFormSchema,
  unknownTokens,
  unknownTokensMessage,
} from "../../../shared/captions";
import type { Caption } from "../../../shared/library";
import { resolveTokens } from "../../../shared/tokens";
import { selectActive, useProductsStore } from "../products/productsStore";
import { useCaptionsStore } from "./captionsStore";
import { INPUT, PRIMARY, SECONDARY, tokenProduct, Warning } from "./captionUi";

export type CaptionFormMode =
  | {
      kind: "create";
      productId?: string | null;
      // Prefills, e.g. "Save to bank" from the editor.
      text?: string;
      slot?: CaptionSlot;
    }
  | { kind: "edit"; caption: Caption };

const GENERIC = "";

// Add or edit one caption. The preview shows the text with {product} filled in for the
// chosen product (or for a "preview with" product when the caption is generic).
export const CaptionFormModal: React.FC<{
  mode: CaptionFormMode;
  onClose: () => void;
  // The caption that was just created (create mode only).
  onSaved?: (caption: Caption) => void;
}> = ({ mode, onClose, onSaved }) => {
  const editing = mode.kind === "edit" ? mode.caption : null;
  const products = useProductsStore((s) => s.products);
  const create = useCaptionsStore((s) => s.create);
  const update = useCaptionsStore((s) => s.update);
  const ids = { text: useId(), slot: useId(), product: useId(), view: useId() };

  const initial = {
    text:
      editing?.text ?? (mode.kind === "create" ? mode.text : undefined) ?? "",
    slot:
      editing?.slot ??
      (mode.kind === "create" ? mode.slot : undefined) ??
      ("any" as CaptionSlot),
    productId:
      (editing
        ? editing.productId
        : mode.kind === "create"
          ? mode.productId
          : null) ?? GENERIC,
  };
  const [text, setText] = useState(initial.text);
  const [slot, setSlot] = useState<CaptionSlot>(initial.slot);
  const [productId, setProductId] = useState(initial.productId);
  const [previewId, setPreviewId] = useState(GENERIC);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const active = useMemo(
    () =>
      [...selectActive(products)].sort((a, b) =>
        a.fullName.localeCompare(b.fullName),
      ),
    [products],
  );
  // A caption on an archived product keeps that product in the list so the select never
  // falls back to something else on its own.
  const current = products.find((p) => p.id === initial.productId);
  const keepArchived =
    current && current.archivedAt !== null ? current : undefined;

  const previewProduct = tokenProduct(
    products.find(
      (p) => p.id === (productId !== GENERIC ? productId : previewId),
    ),
  );
  const resolved = resolveTokens(text, previewProduct);
  const unknown = unknownTokens(text);

  const parsed = CaptionFormSchema.safeParse({
    text,
    slot,
    productId: productId === GENERIC ? null : productId,
  });
  const textError =
    attempted && !parsed.success
      ? parsed.error.issues.find((i) => i.path[0] === "text")?.message
      : undefined;
  const dirty =
    text !== initial.text ||
    slot !== initial.slot ||
    productId !== initial.productId;

  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    setAttempted(true);
    setError(null);
    if (!parsed.success) {
      return;
    }
    setSaving(true);
    try {
      const form = parsed.data;
      const result = editing
        ? await update({
            id: editing.id,
            patch: {
              ...(form.text !== editing.text ? { text: form.text } : {}),
              ...(form.slot !== editing.slot ? { slot: form.slot } : {}),
              ...(form.productId !== editing.productId
                ? { productId: form.productId }
                : {}),
            },
          })
        : await create(form);
      if (result.ok) {
        if (!editing) {
          onSaved?.(result.value as Caption);
        }
        onClose();
      } else {
        setError(result.message);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? "Edit caption" : "Add caption"}
      onClose={onClose}
      busy={saving}
      dirty={dirty}
      widthClass="max-w-xl"
    >
      <form
        onSubmit={(e) => void submit(e)}
        className="mt-4 flex flex-col gap-4"
      >
        <div>
          <label
            htmlFor={ids.text}
            className="mb-1.5 block text-sm font-medium"
          >
            Text
          </label>
          <textarea
            id={ids.text}
            autoFocus
            rows={4}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="10/10 {product}"
            aria-invalid={textError ? true : undefined}
            className={`${INPUT} resize-y`}
          />
          <p className="mt-1 flex justify-between text-xs text-app-dim">
            <span>
              Use {"{product}"}, {"{short}"} or {"{full}"}. Press Enter for a
              line break.
            </span>
            <span>
              {text.trim().length}/{CAPTION_TEXT_MAX}
            </span>
          </p>
          {textError && (
            <p role="alert" className="mt-1 text-xs text-red-400">
              {textError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor={ids.slot}
              className="mb-1.5 block text-sm font-medium"
            >
              Slot
            </label>
            <select
              id={ids.slot}
              value={slot}
              onChange={(event) => setSlot(event.target.value as CaptionSlot)}
              className={INPUT}
            >
              {CAPTION_SLOTS.map((value) => (
                <option key={value} value={value}>
                  {CAPTION_SLOT_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor={ids.product}
              className="mb-1.5 block text-sm font-medium"
            >
              Product
            </label>
            <select
              id={ids.product}
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className={INPUT}
            >
              <option value={GENERIC}>Generic (every product)</option>
              {keepArchived && (
                <option value={keepArchived.id}>
                  {keepArchived.fullName} (archived)
                </option>
              )}
              {active.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {productId === GENERIC && (
          <div>
            <label
              htmlFor={ids.view}
              className="mb-1.5 block text-sm font-medium"
            >
              Preview with
            </label>
            <select
              id={ids.view}
              value={previewId}
              onChange={(event) => setPreviewId(event.target.value)}
              className={INPUT}
            >
              <option value={GENERIC}>Example product</option>
              {active.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.fullName}
                </option>
              ))}
            </select>
          </div>
        )}

        <div
          className="rounded-md bg-white/5 px-3 py-2 text-sm"
          data-testid="caption-form-preview"
        >
          <p className="mb-1 text-xs text-app-dim">Preview</p>
          {text.trim() === "" ? (
            <p className="text-app-dim">Type a caption to see it here.</p>
          ) : (
            <p className="whitespace-pre-wrap break-words">{resolved.text}</p>
          )}
        </div>
        {unknown.length > 0 && (
          <Warning message={unknownTokensMessage(unknown)} />
        )}

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={SECONDARY}
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className={PRIMARY}>
            {saving ? "Saving..." : editing ? "Save changes" : "Add caption"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
