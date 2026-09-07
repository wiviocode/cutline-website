import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/app.css";
import { useStore } from "./store";
import { HandleFolder } from "@platform/fs";
import { BrowserSupport, ReadOnlyChoice, type SupportReport } from "@platform/browserSupport";

let support: SupportReport | undefined;

/** Pretend environments for the door, with only what the check reads. */
const CAN_RUN = { isSecureContext: true, createImageBitmap: () => {}, indexedDB: {}, OffscreenCanvas: { prototype: { convertToBlob() {} } }, HTMLInputElement: { prototype: { webkitdirectory: "" } } };
const PRETEND: Record<string, Parameters<typeof BrowserSupport.check>[0]> = {
  safari: { ...CAN_RUN, window: {}, FileSystemFileHandle: { prototype: {} },
    navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 0 } },
  firefox: { ...CAN_RUN, window: {},
    navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:130.0) Gecko/20100101 Firefox/130.0", platform: "MacIntel", maxTouchPoints: 0 } },
  iphone: { ...CAN_RUN, window: {},
    navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 } },
  ancient: { window: {}, isSecureContext: true, indexedDB: {},
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/60.0.0.0 Safari/537.36", platform: "Win32", maxTouchPoints: 0 } },
};
// Development only: lets a test drive the store without the OS folder picker, open a folder it
// has built itself in the page's private storage, and see the stop screen from a browser that
// can run the app — `?pretend=` safari, firefox, iphone or ancient in the address.
if (import.meta.env.DEV) {
  const w = window as unknown as { __cutline: typeof useStore; __cutlineFS: { HandleFolder: typeof HandleFolder }; __cutlineSupport: typeof BrowserSupport };
  w.__cutline = useStore;
  w.__cutlineFS = { HandleFolder };
  w.__cutlineSupport = BrowserSupport;
  const pretend = new URLSearchParams(window.location.search).get("pretend");
  if (pretend) { support = BrowserSupport.check(PRETEND[pretend] ?? PRETEND.safari); ReadOnlyChoice.forget(); }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App support={support} />
  </React.StrictMode>,
);
