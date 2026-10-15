import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("react-root");

if (!container) {
  throw new Error("Renderer UI did not mount correctly.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
