/**
 * Whether this browser can run Cutline, and whether it can finish the job.
 *
 * Two tiers, because the two failures are different. A browser with no way to decode a
 * photograph, no storage or no folder input cannot run the app at all, and is stopped. A browser
 * that can do all of that but cannot write to a folder on disk — Safari and Firefox, which
 * implement only the sandboxed Origin Private File System, never the disk pickers — can caption
 * a shoot but never file the caption into the image, which is the point of Cutline. That one is
 * argued with, hard, and let past only if the photographer insists.
 *
 * The decision is made by feature, never by user-agent string: a browser that has the APIs is
 * supported whatever it calls itself. The name is read only to word the explanation.
 */

/** What a missing ability costs: the whole app, or only the writing. */
export type Tier = "fatal" | "writing";

export interface Requirement {
  id: string;
  /** In the user's words, for the list of what is missing. */
  label: string;
  tier: Tier;
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
  HTMLInputElement?: { prototype: object };
  createImageBitmap?: unknown;
  indexedDB?: unknown;
}

export interface SupportReport {
  /** The app can be used at all. False stops at the door, with no way past. */
  canRun: boolean;
  /** Captions can be written into the photographs. False is the read-only argument. */
  canWrite: boolean;
  /** Fatal misses, named for the list. */
  blocking: Requirement[];
  /** What read-only costs, named for the list. */
  writingBlocked: Requirement[];
  /** The browser's name as best it can be told, for the message; null when unclear. */
  browser: string | null;
  /** iPhone, iPad or Android — no folder to pick and no room to review, so these are stopped. */
  mobile: boolean;
}

export const REQUIREMENTS: Requirement[] = [
  {
    id: "secureContext",
    label: "a secure (https) address",
    tier: "fatal",
    present: (env) => env.isSecureContext === true,
  },
  {
    id: "folderInput",
    label: "opening a folder of photographs",
    tier: "fatal",
    present: (env) => !!env.HTMLInputElement && "webkitdirectory" in env.HTMLInputElement.prototype,
  },
  {
    id: "imageBitmap",
    label: "decoding photographs",
    tier: "fatal",
    present: (env) => typeof env.createImageBitmap === "function",
  },
  {
    id: "offscreenCanvas",
    label: "resizing photographs for the model",
    tier: "fatal",
    present: (env) => !!env.OffscreenCanvas && "convertToBlob" in env.OffscreenCanvas.prototype,
  },
  {
    id: "indexedDB",
    label: "remembering settings between visits",
    tier: "fatal",
    present: (env) => env.indexedDB != null,
  },
  {
    id: "directoryPicker",
    label: "opening a folder for writing",
    tier: "writing",
    present: (env) => !!env.window && "showDirectoryPicker" in env.window,
  },
  {
    id: "writableFiles",
    label: "writing captions into the photographs",
    tier: "writing",
    present: (env) => !!env.FileSystemFileHandle && "createWritable" in env.FileSystemFileHandle.prototype,
  },
];

/** What read-only costs, in the order the argument makes them. */
export const READ_ONLY_LOSES = [
  "the caption written into the photograph",
  "renaming the files",
  "a record of what you have done",
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
  loses: READ_ONLY_LOSES,

  check(env: BrowserEnvironment = BrowserSupport.live()): SupportReport {
    const missing = REQUIREMENTS.filter((r) => !r.present(env));
    const blocking = missing.filter((r) => r.tier === "fatal");
    const writingBlocked = missing.filter((r) => r.tier === "writing");
    const mobile = BrowserSupport.isMobile(env);
    return {
      // A phone has no folder to hand over and no room to judge a frame, so it is stopped even
      // when the APIs it would need are nominally present.
      canRun: blocking.length === 0 && !mobile,
      canWrite: writingBlocked.length === 0,
      blocking,
      writingBlocked,
      browser: BrowserSupport.name(env),
      mobile,
    };
  },

  /** The page's real environment. */
  live(): BrowserEnvironment {
    const g = globalThis as unknown as BrowserEnvironment;
    return {
      window: typeof window === "undefined" ? undefined : window,
      navigator: typeof navigator === "undefined" ? undefined : (navigator as BrowserEnvironment["navigator"]),
      isSecureContext: typeof window === "undefined" ? undefined : window.isSecureContext,
      OffscreenCanvas: g.OffscreenCanvas,
      FileSystemFileHandle: g.FileSystemFileHandle,
      HTMLInputElement: g.HTMLInputElement,
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

/**
 * That the photographer chose read-only anyway, kept per browser. The argument is made once;
 * after that the title bar's "read-only browser" tag is the standing reminder. Local storage
 * rather than the settings database, because it is a fact about this browser, not about the desk.
 */
const READ_ONLY_KEY = "cutline.readOnlyAccepted";

export const ReadOnlyChoice = {
  accepted(): boolean {
    try { return localStorage.getItem(READ_ONLY_KEY) === "yes"; } catch { return false; }
  },
  accept(): void {
    try { localStorage.setItem(READ_ONLY_KEY, "yes"); } catch { /* private window: they will be asked again */ }
  },
  forget(): void {
    try { localStorage.removeItem(READ_ONLY_KEY); } catch { /* nothing to forget */ }
  },
};
