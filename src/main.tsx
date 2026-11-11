import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ApiContext, createApi } from "./api";
import { ToastProvider } from "./lib/hooks";
import "./styles.css";

const api = createApi();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApiContext.Provider value={api}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ApiContext.Provider>
  </StrictMode>,
);
