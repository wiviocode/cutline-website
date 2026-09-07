import { beforeEach, describe, expect, it } from "vitest";
import { BrowserSupport, ReadOnlyChoice, REQUIREMENTS, type BrowserEnvironment } from "../src/platform/browserSupport";

/** Everything a desktop Chromium browser has, so a test removes one thing at a time. */
function chromium(over: Partial<BrowserEnvironment> = {}): BrowserEnvironment {
  return {
    window: { showDirectoryPicker() {} },
    isSecureContext: true,
    FileSystemFileHandle: { prototype: { createWritable() {} } },
    HTMLInputElement: { prototype: { webkitdirectory: "" } },
    OffscreenCanvas: { prototype: { convertToBlob() {} } },
    createImageBitmap: () => {},
    indexedDB: {},
    navigator: {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      userAgentData: { brands: [{ brand: "Not;A=Brand", version: "99" }, { brand: "Google Chrome", version: "128" }, { brand: "Chromium", version: "128" }], mobile: false, platform: "macOS" },
      platform: "MacIntel", maxTouchPoints: 0,
    },
    ...over,
  };
}

const SAFARI_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const FIREFOX_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:130.0) Gecko/20100101 Firefox/130.0";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";

/** A desktop browser with the sandboxed file system only: Safari and Firefox. */
const desktopReadOnly = (ua: string) => chromium({ window: {}, FileSystemFileHandle: { prototype: {} }, navigator: { userAgent: ua, platform: "MacIntel", maxTouchPoints: 0 } });

describe("BrowserSupport", () => {
  it("passes a desktop Chromium browser outright and names it from client hints", () => {
    const r = BrowserSupport.check(chromium());
    expect(r).toMatchObject({ canRun: true, canWrite: true, browser: "Google Chrome", mobile: false });
    expect(r.blocking).toEqual([]);
    expect(r.writingBlocked).toEqual([]);
  });

  it("decides by feature, not by name: a Chromium browser with the APIs passes whatever it is called", () => {
    const brave = chromium({ navigator: { userAgent: "Chrome/128.0.0.0", userAgentData: { brands: [{ brand: "Brave", version: "1" }, { brand: "Chromium", version: "128" }] } } });
    expect(BrowserSupport.check(brave)).toMatchObject({ canRun: true, canWrite: true, browser: "Brave" });
  });

  it("lets Safari run but not write, and names what read-only costs", () => {
    const r = BrowserSupport.check(desktopReadOnly(SAFARI_UA));
    expect(r).toMatchObject({ canRun: true, canWrite: false, browser: "Safari", mobile: false });
    expect(r.blocking).toEqual([]);
    expect(r.writingBlocked.map((m) => m.id)).toEqual(["directoryPicker", "writableFiles"]);
  });

  it("lets Firefox run but not write", () => {
    const r = BrowserSupport.check(chromium({ window: {}, FileSystemFileHandle: undefined, navigator: { userAgent: FIREFOX_UA, platform: "MacIntel", maxTouchPoints: 0 } }));
    expect(r).toMatchObject({ canRun: true, canWrite: false, browser: "Firefox" });
    expect(r.writingBlocked.map((m) => m.id)).toContain("directoryPicker");
  });

  it("stops phones and tablets outright — there is no folder to hand over", () => {
    expect(BrowserSupport.check(chromium({ window: {}, navigator: { userAgent: IPHONE_UA, platform: "iPhone", maxTouchPoints: 5 } })))
      .toMatchObject({ canRun: false, mobile: true });
    // An iPad on iPadOS 13+ calls itself a Mac; the touch points give it away.
    expect(BrowserSupport.check(chromium({ window: {}, navigator: { userAgent: SAFARI_UA, platform: "MacIntel", maxTouchPoints: 5 } })))
      .toMatchObject({ canRun: false, mobile: true });
    // Android Chrome has the writing APIs and would otherwise pass outright.
    expect(BrowserSupport.check(chromium({ navigator: { userAgent: ANDROID_CHROME_UA, platform: "Linux armv8l", maxTouchPoints: 5 } })))
      .toMatchObject({ canRun: false, canWrite: true, mobile: true, browser: "Chrome" });
  });

  it("stops a browser that cannot even open a folder, or decode, or store", () => {
    expect(BrowserSupport.check(chromium({ HTMLInputElement: { prototype: {} } })).blocking.map((m) => m.id)).toEqual(["folderInput"]);
    expect(BrowserSupport.check(chromium({ createImageBitmap: undefined })).canRun).toBe(false);
    expect(BrowserSupport.check(chromium({ OffscreenCanvas: undefined })).canRun).toBe(false);
    expect(BrowserSupport.check(chromium({ indexedDB: undefined })).canRun).toBe(false);
  });

  it("stops an insecure address, since the folder APIs are only offered on https", () => {
    const r = BrowserSupport.check(chromium({ isSecureContext: false }));
    expect(r.canRun).toBe(false);
    expect(r.blocking.map((m) => m.id)).toEqual(["secureContext"]);
  });

  it("every requirement has a tier and a label in the user's words", () => {
    for (const r of REQUIREMENTS) {
      expect(r.label.length).toBeGreaterThan(8);
      expect(["fatal", "writing"]).toContain(r.tier);
    }
  });

  it("names Edge and Chrome on iOS from the user agent when there are no client hints", () => {
    expect(BrowserSupport.name({ navigator: { userAgent: "Mozilla/5.0 AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0" } })).toBe("Microsoft Edge");
    expect(BrowserSupport.name({ navigator: { userAgent: "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/128.0 Mobile/15E148 Safari/604.1" } })).toBe("Chrome on iOS");
    expect(BrowserSupport.name({ navigator: { userAgent: "curl/8.0" } })).toBeNull();
  });
});

describe("ReadOnlyChoice", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    });
  });

  it("remembers that the photographer insisted, and forgets on request", () => {
    expect(ReadOnlyChoice.accepted()).toBe(false);
    ReadOnlyChoice.accept();
    expect(ReadOnlyChoice.accepted()).toBe(true);
    ReadOnlyChoice.forget();
    expect(ReadOnlyChoice.accepted()).toBe(false);
  });

  it("treats a browser that refuses storage as not having accepted, rather than throwing", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() { throw new DOMException("denied", "SecurityError"); },
    });
    expect(ReadOnlyChoice.accepted()).toBe(false);
    expect(() => ReadOnlyChoice.accept()).not.toThrow();
  });
});
