import { NewVideoPage } from "../editor/NewVideoPage";
import { HistoryPage } from "../history/HistoryPage";
import { CaptionsPage } from "../captions/CaptionsPage";
import { ProductDetailPage } from "../products/ProductDetailPage";
import { ProductsPage } from "../products/ProductsPage";
import { SettingsPage } from "../settings/SettingsPage";
import { useNavStore } from "./navStore";
import { PAGES } from "./pages";

export const PageView: React.FC = () => {
  const page = useNavStore((state) => state.page);
  const selectedProductId = useNavStore((state) => state.selectedProductId);
  const label = PAGES.find((item) => item.id === page)?.label ?? page;
  // An open product page prints its own heading (the product name).
  const detail = page === "products" && selectedProductId !== null;

  return (
    <main className="flex flex-1 flex-col overflow-auto p-8">
      {!detail && (
        <h1 className="text-2xl font-semibold tracking-tight">{label}</h1>
      )}
      {detail && <ProductDetailPage productId={selectedProductId} />}
      {page === "products" && !detail && <ProductsPage />}
      {page === "captions" && <CaptionsPage />}
      {page === "new-video" && <NewVideoPage />}
      {page === "history" && <HistoryPage />}
      {page === "settings" && <SettingsPage />}
    </main>
  );
};
