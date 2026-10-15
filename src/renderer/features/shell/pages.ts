export const PAGES = [
  { id: "products", label: "Products" },
  { id: "captions", label: "Captions" },
  { id: "new-video", label: "New Video" },
  { id: "batch", label: "Batch" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
] as const;

export type PageId = (typeof PAGES)[number]["id"];
