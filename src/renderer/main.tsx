import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

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
    <App />
  </StrictMode>,
);
