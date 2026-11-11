import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ApiContext, createApi } from "./api";
import { ToastProvider } from "./lib/hooks";
import { BrandingProvider } from "./lib/branding";
import "./styles.css";

const api = createApi();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApiContext.Provider value={api}>
      <BrandingProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrandingProvider>
    </ApiContext.Provider>
  </StrictMode>,
);
