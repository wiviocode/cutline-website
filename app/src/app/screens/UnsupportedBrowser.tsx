/**
 * The door. Two ways it can go:
 *
 *  - Blocked: the browser cannot run Cutline at all, or it is a phone. No way past.
 *  - Read-only: it can caption but never write the caption into the photograph. The case for
 *    changing browser is put plainly, and going on anyway takes two deliberate clicks, because
 *    a photographer who does it by accident loses the whole point of the app.
 */

import React, { useState } from "react";
import { Button, Mark } from "../components";
import { BrowserSupport, type SupportReport } from "@platform/browserSupport";

export function UnsupportedBrowser({ report, onContinue }: { report: SupportReport; onContinue?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [sure, setSure] = useState(false);
  const who = report.browser ?? "This browser";
  const readOnly = report.canRun && !!onContinue;
  const missing = report.blocking.length ? report.blocking : report.writingBlocked;
  const lines = readOnly ? BrowserSupport.loses : missing.map((m) => m.label);

  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* no clipboard: the address bar still works */ }
  };

  return (
    <main className="unsupported" role="alert" aria-labelledby="unsupported-title">
      <div className="unsupported-inner">
        <div className="unsupported-brand"><Mark size={44} /><span className="appname">Cutline</span></div>

        <h1 id="unsupported-title">
          {report.mobile ? "Cutline needs a desktop browser."
            : readOnly ? `${who} can't write captions into your photographs.`
            : `${who} can't run Cutline.`}
        </h1>

        <p className="lede">
          {report.mobile
            ? "No phone or tablet browser can open a folder for writing. Open this page on a Mac or PC in Chrome, Edge or Brave."
            : readOnly
            ? `Writing the caption into the image is the point of Cutline, and ${who} has no way to write to your disk. You can caption a shoot here, but the captions stay in this tab.`
            : "Cutline writes captions into the photographs on your disk. Only Chrome, Edge and Brave can do that."}
        </p>

        {!report.mobile && (
          <div className="unsupported-list" aria-label={readOnly ? "What you lose" : "What this browser cannot do"}>
            <span className="overline">{readOnly ? `In ${who} you lose` : `${who} is missing`}</span>
            <ul>{lines.map((line) => <li key={line}>{line}</li>)}</ul>
          </div>
        )}

        <div className="unsupported-browsers">
          {BrowserSupport.browsers.map((b) => (
            <a key={b.name} className="btn btn-primary btn-lg" href={b.url} target="_blank" rel="noreferrer">{b.name}</a>
          ))}
        </div>

        <p className="unsupported-foot">
          Already have one? <button type="button" className="linkish" onClick={copy}>{copied ? "Copied" : "Copy this page's address"}</button> and open it there.
        </p>

        {readOnly && (
          <div className="unsupported-anyway">
            {!sure ? (
              <button type="button" className="linkish" onClick={() => setSure(true)}>Continue without writing</button>
            ) : (
              <div className="unsupported-confirm">
                <p>Nothing will be written to your photographs and nothing will be renamed.</p>
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
