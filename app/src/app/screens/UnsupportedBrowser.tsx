/**
 * The stop before the app: this browser cannot run Cutline, here is why, and here is what can.
 * There is no way past it — a shoot set up here would end with nothing written to the files.
 */

import React, { useState } from "react";
import { Mark } from "../components";
import { BrowserSupport, type SupportReport } from "@platform/browserSupport";

export function UnsupportedBrowser({ report }: { report: SupportReport }) {
  const [copied, setCopied] = useState(false);
  const who = report.browser ?? "This browser";
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* no clipboard: the address bar still works */ }
  };

  return (
    <main className="unsupported" role="alert" aria-labelledby="unsupported-title">
      <div className="unsupported-inner">
        <div className="unsupported-brand"><Mark size={44} /><span className="appname">Cutline</span></div>
        <h1 id="unsupported-title">{report.mobile ? "Cutline needs a desktop browser." : `${who} can't run Cutline.`}</h1>
        <p className="lede">
          {report.mobile
            ? "Cutline writes captions into the photographs on your disk, and no phone or tablet browser can open a folder for writing. Open this page on a Mac or PC in Chrome, Edge or Brave."
            : "Cutline writes captions into the photographs on your disk, which only Chrome, Edge and Brave can do. A shoot set up here would end with nothing written to your files, so it stops now rather than then."}
        </p>
        <div className="unsupported-list" aria-label="What this browser cannot do">
          <span className="overline">{who} is missing</span>
          <ul>
            {report.missing.map((m) => <li key={m.id}>{m.label}</li>)}
          </ul>
        </div>
        <div className="unsupported-browsers">
          {BrowserSupport.browsers.map((b) => (
            <a key={b.name} className="btn btn-secondary btn-lg" href={b.url} target="_blank" rel="noreferrer">{b.name}</a>
          ))}
        </div>
        <p className="unsupported-foot">
          Already have one? <button type="button" className="linkish" onClick={copy}>{copied ? "Copied" : "Copy this page's address"}</button> and open it there. Your photographs never go anywhere but the model you choose.
        </p>
      </div>
    </main>
  );
}
