import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

// HashRouter (URLs like /#/eleveur) so deep links survive a refresh on GitHub
// Pages, which has no SPA fallback for real paths.
createRoot(rootEl).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
