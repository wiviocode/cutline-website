/**
 * The door. Two ways it can go:
 *
 *  - Blocked — the browser cannot run Cutline at all, or it is a phone. No way past.
 *  - Read-only — it can caption but never write the caption into the photograph. The case for
 *    changing browser is made plainly and at length, and going on anyway takes two deliberate
 *    clicks, because a photographer who does it by accident loses the whole point of the app.
 */

import React, { useState } from "react";
import { Button, Mark } from "../components";
import { BrowserSupport, type SupportReport } from "@platform/browserSupport";

export function UnsupportedBrowser({ report, onContinue }: { report: SupportReport; onContinue?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [sure, setSure] = useState(false);
  const who = report.browser ?? "This browser";
  const readOnly = report.canRun && !!onContinue;

  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* no clipboard: the address bar still works */ }
  };

  return (
    <main className="unsupported" role="alert" aria-labelledby="unsupported-title">
      <div className="unsupported-inner">
        <div className="unsupported-brand"><Mark size={44} /><span className="appname">Cutline</span></div>

        <h1 id="unsupported-title">
          {report.mobile ? "Cutline needs a desktop browser."
            : readOnly ? `${who} can't file captions into your photographs.`
            : `${who} can't run Cutline.`}
        </h1>

        <p className="lede">
          {report.mobile
            ? "Cutline writes captions into the photographs on your disk, and no phone or tablet browser can open a folder for writing. Open this page on a Mac or PC in Chrome, Edge or Brave."
            : readOnly
            ? `Filing the caption into the image — where every wire system reads it — is what Cutline is for, and ${who} has no way to write to a folder on your disk. You can open a shoot here and caption it, but the captions stay in this tab. Your photographs would leave exactly as they arrived.`
            : "Cutline writes captions into the photographs on your disk, which only Chrome, Edge and Brave can do. A shoot set up here would end with nothing written to your files, so it stops now rather than then."}
        </p>

        <div className="unsupported-list" aria-label={readOnly ? "What you would not get" : "What this browser cannot do"}>
          <span className="overline">{readOnly ? `In ${who} you would not get` : `${who} is missing`}</span>
          <ul>
            {(readOnly ? BrowserSupport.loses : [...report.blocking, ...report.writingBlocked].map((m) => m.label)).map((line) => (
              <li key={typeof line === "string" ? line : String(line)}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="unsupported-browsers">
          {BrowserSupport.browsers.map((b) => (
            <a key={b.name} className="btn btn-primary btn-lg" href={b.url} target="_blank" rel="noreferrer">{b.name}</a>
          ))}
        </div>

        <p className="unsupported-foot">
          Already have one? <button type="button" className="linkish" onClick={copy}>{copied ? "Copied" : "Copy this page's address"}</button> and open it there. Your photographs never go anywhere but the model you choose.
        </p>

        {readOnly && (
          <div className="unsupported-anyway">
            {!sure ? (
              <button type="button" className="linkish" onClick={() => setSure(true)}>Continue in {who} without writing</button>
            ) : (
              <div className="unsupported-confirm">
                <p>Nothing will be written to your photographs, and nothing will be renamed. You would be captioning to the screen only.</p>
                <div className="unsupported-confirm-actions">
                  <Button variant="secondary" onClick={onContinue}>Yes, continue read-only</Button>
                  <Button variant="ghost" onClick={() => setSure(false)}>Never mind</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
