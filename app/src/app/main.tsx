import { StrictMode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/app.css";
import { App } from "./App";
import { useStore } from "./store";
import { HandleFolder } from "@platform/fs";

// In development only: a handle for driving the app from a test harness.
if (import.meta.env.DEV) (window as unknown as { cutline: unknown }).cutline = { useStore, HandleFolder };

createRoot(document.getElementById("root")!).render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>);
