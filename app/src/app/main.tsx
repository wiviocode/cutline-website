import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/app.css";
import { useStore } from "./store";
import { HandleFolder } from "@platform/fs";

// Development only: lets a test drive the store without the OS folder picker, and open a
// folder it has built itself in the page's private storage.
if (import.meta.env.DEV) {
  const w = window as unknown as { __cutline: typeof useStore; __cutlineFS: { HandleFolder: typeof HandleFolder } };
  w.__cutline = useStore;
  w.__cutlineFS = { HandleFolder };
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
