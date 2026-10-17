import { useId, useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import {
  validateBulkCaptions,
  type BulkLine,
} from "../../../shared/bulkCaptions";
import {
  BULK_ADD_MAX,
  unknownTokens,
  unknownTokensMessage,
} from "../../../shared/captions";
import { resolveTokens } from "../../../shared/tokens";
import { selectActive, useProductsStore } from "../products/productsStore";
import { useCaptionsStore } from "./captionsStore";
import {
  INPUT,
  PRIMARY,
  SECONDARY,
  SlotBadge,
  tokenProduct,
} from "./captionUi";

const GENERIC = "";
const PLACEHOLDER = `before | I can't fix my smile lines, it's genetics
after | 4 weeks later
broll | your sign to try {product}
any | 10/10 {product}`;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function PreviewLine({
  entry,
  resolve,
}: {
  entry: BulkLine;
  resolve: (text: string) => string;
}) {
  if (entry.kind === "error") {
    return (
      <li
        data-testid="bulk-line-error"
        className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
      >
        <span className="text-red-300">
          Line {entry.line}: {entry.message}
        </span>
        <span className="mt-0.5 block truncate font-mono text-xs text-app-muted">
          {entry.raw.trim()}
        </span>
      </li>
    );
  }
  const unknown = unknownTokens(entry.text);
  const duplicate = entry.kind === "duplicate";
  return (
    <li
      data-testid={duplicate ? "bulk-line-duplicate" : "bulk-line-ok"}
      className={
        "flex items-start gap-3 rounded-md bg-white/5 px-3 py-2 text-sm " +
        (duplicate ? "opacity-70" : "")
      }
    >
      <span className="w-12 shrink-0 pt-0.5 text-xs text-app-dim">
        {entry.line}
      </span>
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap break-words">{resolve(entry.text)}</p>
        {unknown.length > 0 && (
          <p className="mt-0.5 text-xs text-amber-300">
            {unknownTokensMessage(unknown)}
          </p>
        )}
        {duplicate && (
          <p className="mt-0.5 text-xs text-amber-300">{entry.message}</p>
        )}
      </div>
      <SlotBadge slot={entry.slot} />
    </li>
  );
}

// Paste captions in the bulk format, check every line before anything is saved, and add
// the ones that pass. Lines that need fixing stay in the box after a partial save.
export const BulkAddModal: React.FC<{
  productId?: string | null;
  onClose: () => void;
}> = ({ productId: initialProductId = null, onClose }) => {
  const products = useProductsStore((s) => s.products);
  const captions = useCaptionsStore((s) => s.captions);
  const bulkAdd = useCaptionsStore((s) => s.bulkAdd);
  const ids = { text: useId(), product: useId() };

  const [text, setText] = useState("");
  const [productId, setProductId] = useState(initialProductId ?? GENERIC);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = useMemo(
    () =>
      [...selectActive(products)].sort((a, b) =>
        a.fullName.localeCompare(b.fullName),
      ),
    [products],
  );
  const target = productId === GENERIC ? null : productId;
  const validation = useMemo(
    () =>
      validateBulkCaptions(text, {
        productId: target,
        existing: captions,
        allowDuplicates,
      }),
    [text, target, captions, allowDuplicates],
  );
  const previewProduct = tokenProduct(products.find((p) => p.id === target));
  const resolve = (value: string) => resolveTokens(value, previewProduct).text;

  const count = validation.items.length;
  const skippedDuplicates = allowDuplicates ? 0 : validation.duplicates.length;

  async function save() {
    if (count === 0) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await bulkAdd({
        productId: target,
        items: validation.items,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const left = validation.errors;
      if (left.length === 0) {
        onClose();
        return;
      }
      setText(left.map((line) => line.raw.trim()).join("\n"));
      setNotice(
        `Added ${result.value.length}. ${plural(left.length, "line needs", "lines need")} fixing.` +
          (skippedDuplicates > 0
            ? ` ${plural(skippedDuplicates, "duplicate", "duplicates")} skipped.`
            : ""),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  const summary = [
    `${count} ready`,
    skippedDuplicates > 0 ? `${skippedDuplicates} duplicate skipped` : null,
    validation.errors.length > 0
      ? plural(
          validation.errors.length,
          "line needs fixing",
          "lines need fixing",
        )
      : null,
  ].filter(Boolean);

  return (
    <Modal
      title="Bulk add captions"
      onClose={onClose}
      busy={saving}
      dirty={text.trim() !== ""}
      widthClass="max-w-3xl"
    >
      <div className="mt-4 flex flex-col gap-4">
        <div>
          <label
            htmlFor={ids.text}
            className="mb-1.5 block text-sm font-medium"
          >
            Captions, one per line
          </label>
          <textarea
            id={ids.text}
            autoFocus
            rows={8}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setNotice(null);
            }}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            className={`${INPUT} resize-y font-mono`}
          />
          <p className="mt-1 text-xs text-app-dim">
            Format: slot | text. The slot is before, after, broll or any (a line
            without | is any). Write \n for a line break. Up to {BULK_ADD_MAX}{" "}
            at a time.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-56 flex-1">
            <label
              htmlFor={ids.product}
              className="mb-1.5 block text-sm font-medium"
            >
              Add all to
            </label>
            <select
              id={ids.product}
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className={INPUT}
            >
              <option value={GENERIC}>Generic (every product)</option>
              {active.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.fullName}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={allowDuplicates}
              onChange={(event) => setAllowDuplicates(event.target.checked)}
            />
            Add duplicates anyway
          </label>
        </div>

        {validation.lines.length > 0 && (
          <section aria-label="Preview">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-app-dim">
              Preview
              <span className="ml-2 normal-case tracking-normal">
                {summary.join(", ")}
              </span>
            </h3>
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {validation.lines.map((entry) => (
                <PreviewLine key={entry.line} entry={entry} resolve={resolve} />
              ))}
            </ul>
          </section>
        )}

        {notice && (
          <p role="status" className="text-sm text-app-muted">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={SECONDARY}
          >
            {notice ? "Done" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || count === 0}
            className={PRIMARY}
          >
            {saving
              ? "Adding..."
              : `Add ${plural(count, "caption", "captions")}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};
