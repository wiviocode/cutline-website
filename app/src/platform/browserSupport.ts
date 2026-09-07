/**
 * Whether this browser can run Cutline at all.
 *
 * Cutline writes captions into the photographs on the user's disk, which only the File System
 * Access API allows — a Chromium-only API on desktop. Safari and Firefox can hand over a folder
 * read-only, and phones cannot hand over a folder at all. A photographer who set up a whole
 * shoot in one of those and found nothing written would have lost an hour, so the app checks
 * before it shows anything, and stops rather than pretending.
 *
 * The decision is made by feature, never by user-agent string: a browser that has the APIs is
 * supported whatever it calls itself. The name is read only to word the explanation.
 */

/** One thing the app cannot do without. */
export interface Requirement {
  id: string;
  /** In the user's words, for the list of what is missing. */
  label: string;
  present(env: BrowserEnvironment): boolean;
}

/** The pieces of the page's global scope the check reads, so a test can hand in a pretend browser. */
export interface BrowserEnvironment {
  window?: object;
  navigator?: {
    userAgent?: string;
    userAgentData?: { brands?: { brand: string; version: string }[]; mobile?: boolean; platform?: string };
    platform?: string;
    maxTouchPoints?: number;
  };
  isSecureContext?: boolean;
  OffscreenCanvas?: { prototype: object };
  FileSystemFileHandle?: { prototype: object };
  createImageBitmap?: unknown;
  indexedDB?: unknown;
}

export interface SupportReport {
  supported: boolean;
  missing: Requirement[];
  /** The browser's name as best it can be told, for the message; null when unclear. */
  browser: string | null;
  /** iPhone, iPad or Android — every browser there lacks a writable folder, so the advice differs. */
  mobile: boolean;
}

export const REQUIREMENTS: Requirement[] = [
  {
    id: "secureContext",
    label: "a secure (https) address",
    present: (env) => env.isSecureContext === true,
  },
  {
    id: "directoryPicker",
    label: "opening a folder of photographs for writing",
    present: (env) => !!env.window && "showDirectoryPicker" in env.window,
  },
  {
    id: "writableFiles",
    label: "writing captions back into the photographs",
    present: (env) => !!env.FileSystemFileHandle && "createWritable" in env.FileSystemFileHandle.prototype,
  },
  {
    id: "offscreenCanvas",
    label: "resizing photographs for the model",
    present: (env) => !!env.OffscreenCanvas && "convertToBlob" in env.OffscreenCanvas.prototype,
  },
  {
    id: "imageBitmap",
    label: "decoding photographs",
    present: (env) => typeof env.createImageBitmap === "function",
  },
  {
    id: "indexedDB",
    label: "remembering settings between visits",
    present: (env) => env.indexedDB != null,
  },
];

/** The browsers that pass, in the order the message offers them. */
export const SUPPORTED_BROWSERS = [
  { name: "Google Chrome", url: "https://www.google.com/chrome/" },
  { name: "Microsoft Edge", url: "https://www.microsoft.com/edge" },
  { name: "Brave", url: "https://brave.com/download/" },
];

export const BrowserSupport = {
  requirements: REQUIREMENTS,
  browsers: SUPPORTED_BROWSERS,

  check(env: BrowserEnvironment = BrowserSupport.live()): SupportReport {
    const missing = REQUIREMENTS.filter((r) => !r.present(env));
    return { supported: missing.length === 0, missing, browser: BrowserSupport.name(env), mobile: BrowserSupport.isMobile(env) };
  },

  /** The page's real environment. */
  live(): BrowserEnvironment {
    const g = globalThis as unknown as BrowserEnvironment & { window?: object };
    return {
      window: typeof window === "undefined" ? undefined : window,
      navigator: typeof navigator === "undefined" ? undefined : (navigator as BrowserEnvironment["navigator"]),
      isSecureContext: typeof window === "undefined" ? undefined : window.isSecureContext,
      OffscreenCanvas: g.OffscreenCanvas,
      FileSystemFileHandle: g.FileSystemFileHandle,
      createImageBitmap: g.createImageBitmap,
      indexedDB: g.indexedDB,
    };
  },

  /**
   * What the browser calls itself, for the message only. Client hints first, where a Chromium
   * browser names its brand; the user-agent string after, which is all Safari and Firefox give.
   */
  name(env: BrowserEnvironment): string | null {
    const brands = env.navigator?.userAgentData?.brands ?? [];
    const named = brands.map((b) => b.brand).find((b) => !/not.?a.?brand|chromium/i.test(b));
    if (named) return named;
    const ua = env.navigator?.userAgent ?? "";
    if (/firefox|fxios/i.test(ua)) return "Firefox";
    if (/edg(e|a|ios)?\//i.test(ua)) return "Microsoft Edge";
    if (/opr\/|opera/i.test(ua)) return "Opera";
    if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
    if (/crios/i.test(ua)) return "Chrome on iOS";
    if (/chrome\//i.test(ua)) return "Chrome";
    if (/safari\//i.test(ua) && /version\//i.test(ua)) return "Safari";
    return null;
  },

  isMobile(env: BrowserEnvironment): boolean {
    const n = env.navigator;
    if (!n) return false;
    if (n.userAgentData?.mobile) return true;
    const ua = n.userAgent ?? "";
    if (/iphone|ipad|ipod|android|mobile/i.test(ua)) return true;
    // An iPad on iPadOS 13+ reports itself as a Mac; the touch points give it away.
    return n.platform === "MacIntel" && (n.maxTouchPoints ?? 0) > 1;
  },
};
