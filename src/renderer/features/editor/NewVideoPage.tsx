import { ProductPicker } from "../products/ProductPicker";
import { EditorLayout } from "./EditorLayout";
import { useEditorStore } from "./editorStore";

// New Video: pick a product (full-page grid), then the editor. With a draft open the
// grid is skipped; "Close draft" brings it back.
export const NewVideoPage: React.FC = () => {
  const hasDraft = useEditorStore((s) => s.draft !== null);
  const startDraft = useEditorStore((s) => s.startDraft);
  const notice = useEditorStore((s) => s.notice);

  if (hasDraft) {
    return <EditorLayout />;
  }
  return (
    <div>
      <p className="mt-2 text-sm text-app-muted">
        Step 1: choose the product this video is for.
      </p>
      {notice && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {notice}
        </p>
      )}
      <ProductPicker
        layout="page"
        onSelect={(product) => void startDraft(product)}
      />
    </div>
  );
};
