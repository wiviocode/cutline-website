import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/app.css";
import { useStore } from "./store";

// Development only: lets a test drive the store without the OS folder picker.
if (import.meta.env.DEV) (window as unknown as { __cutline: typeof useStore }).__cutline = useStore;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
