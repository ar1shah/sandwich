import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useEditorStore } from "./features/editor/editorStore";
import { installGlobalErrorLogging } from "./log";

installGlobalErrorLogging();

// A file dropped outside a drop zone would make the window open it and replace the app.
// Drop zones handle their own drop events first.
for (const type of ["dragover", "drop"] as const) {
  window.addEventListener(type, (event) => event.preventDefault());
}

const container = document.getElementById("react-root");

if (!container) {
  throw new Error("Renderer UI did not mount correctly.");
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary beforeReport={() => useEditorStore.getState().flush()}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
