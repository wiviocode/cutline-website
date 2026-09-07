import { describe, expect, it } from "vitest";
import { BrowserSupport, REQUIREMENTS, type BrowserEnvironment } from "../src/platform/browserSupport";

/** Everything a desktop Chromium browser has, so a test removes one thing at a time. */
function chromium(over: Partial<BrowserEnvironment> = {}): BrowserEnvironment {
  return {
    window: { showDirectoryPicker() {} },
    isSecureContext: true,
    FileSystemFileHandle: { prototype: { createWritable() {} } },
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

describe("BrowserSupport", () => {
  it("passes a desktop Chromium browser and names it from client hints", () => {
    const r = BrowserSupport.check(chromium());
    expect(r.supported).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.browser).toBe("Google Chrome");
    expect(r.mobile).toBe(false);
  });

  it("decides by feature, not by name: a Chromium browser with the APIs passes whatever it is called", () => {
    const brave = chromium({ navigator: { userAgent: "Chrome/128.0.0.0", userAgentData: { brands: [{ brand: "Brave", version: "1" }, { brand: "Chromium", version: "128" }] } } });
    expect(BrowserSupport.check(brave)).toMatchObject({ supported: true, browser: "Brave" });
  });

  it("stops Safari, which has no writable folder access, and says what is missing", () => {
    const safari = chromium({
      window: {}, FileSystemFileHandle: { prototype: {} },
      navigator: { userAgent: SAFARI_UA, platform: "MacIntel", maxTouchPoints: 0 },
    });
    const r = BrowserSupport.check(safari);
    expect(r.supported).toBe(false);
    expect(r.browser).toBe("Safari");
    expect(r.mobile).toBe(false);
    expect(r.missing.map((m) => m.id)).toEqual(["directoryPicker", "writableFiles"]);
  });

  it("stops Firefox", () => {
    const firefox = chromium({ window: {}, FileSystemFileHandle: undefined, navigator: { userAgent: FIREFOX_UA, platform: "MacIntel", maxTouchPoints: 0 } });
    const r = BrowserSupport.check(firefox);
    expect(r.supported).toBe(false);
    expect(r.browser).toBe("Firefox");
    expect(r.missing.map((m) => m.id)).toContain("directoryPicker");
  });

  it("knows a phone from the user agent, and an iPad that calls itself a Mac from its touch points", () => {
    expect(BrowserSupport.check(chromium({ window: {}, navigator: { userAgent: IPHONE_UA, platform: "iPhone", maxTouchPoints: 5 } })).mobile).toBe(true);
    expect(BrowserSupport.check(chromium({ window: {}, navigator: { userAgent: SAFARI_UA, platform: "MacIntel", maxTouchPoints: 5 } })).mobile).toBe(true);
    expect(BrowserSupport.check(chromium({ window: {}, navigator: { userAgent: ANDROID_CHROME_UA, platform: "Linux armv8l", maxTouchPoints: 5 } })))
      .toMatchObject({ supported: false, mobile: true, browser: "Chrome" });
  });

  it("stops an insecure address, since the folder API is only offered on https", () => {
    const r = BrowserSupport.check(chromium({ isSecureContext: false }));
    expect(r.supported).toBe(false);
    expect(r.missing.map((m) => m.id)).toEqual(["secureContext"]);
  });

  it("every requirement has a label in the user's words", () => {
    for (const r of REQUIREMENTS) expect(r.label.length).toBeGreaterThan(8);
  });

  it("names Edge and Chrome on iOS from the user agent when there are no client hints", () => {
    expect(BrowserSupport.name({ navigator: { userAgent: "Mozilla/5.0 AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0" } })).toBe("Microsoft Edge");
    expect(BrowserSupport.name({ navigator: { userAgent: "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/128.0 Mobile/15E148 Safari/604.1" } })).toBe("Chrome on iOS");
    expect(BrowserSupport.name({ navigator: { userAgent: "curl/8.0" } })).toBeNull();
  });
});
