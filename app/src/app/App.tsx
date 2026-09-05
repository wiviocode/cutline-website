import React, { useEffect } from "react";
import { useStore } from "./store";
import { Button, Mark } from "./components";
import { SetupScreen } from "./screens/SetupScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { SettingsPanel } from "./screens/SettingsPanel";
import { RenamePanel } from "./screens/RenamePanel";

export function App() {
  const s = useStore();
  useEffect(() => { void s.init(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s.ready) return <div className="app"><div className="titlebar"><Mark /><span className="appname">Cutline</span></div></div>;

  return (
    <div className={"app" + (s.panel ? " inert" : "")}>
      <nav className="titlebar">
        <Mark />
        <span className="appname">Cutline</span>
        {s.screen === "review" && s.isRunning && <span className="dim small">captioning…</span>}
        <span className="spacer" />
        {!s.writableFolders && <span className="dim small" title="Safari and Firefox cannot write to files on disk">read-only browser</span>}
        <Button variant="secondary" onClick={() => s.setPanel("settings")} title="API key, caption style and output"><Gear />Settings</Button>
      </nav>
      {!s.apiKey && (
        <div className="banner" role="status">
          <span className="glyph">!</span>
          <div>
            <b>Add your Anthropic API key to start captioning.</b> Cutline calls the model from this page with your own key. The key is kept in this browser, on this site only, and is sent to nothing but api.anthropic.com — so a key saved elsewhere is not here. Get one at <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>console.anthropic.com</a>.
            <div className="banner-actions">
              <Button onClick={() => s.setPanel("settings")}>Add a key in Settings</Button>
            </div>
          </div>
        </div>
      )}
      {s.screen === "setup" ? <SetupScreen /> : <ReviewScreen />}
      {s.panel === "settings" && <SettingsPanel onClose={() => s.setPanel(null)} />}
      {s.panel === "rename" && <RenamePanel onClose={() => s.setPanel(null)} />}
      {s.lastError && (
        <div className="sheet-backdrop" onMouseDown={() => s.clearError()}>
          <div className="sheet small" role="alertdialog">
            <header className="sheet-head"><h1>Something went wrong</h1></header>
            <div className="sheet-body"><p>{s.lastError}</p></div>
            <footer className="sheet-foot"><span className="spacer" /><Button onClick={() => s.clearError()}>OK</Button></footer>
          </div>
        </div>
      )}
    </div>
  );
}

function Gear() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={14} height={14} style={{ fill: "currentColor", display: "block" }}>
      <path fillRule="evenodd" d="M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8zm0 10.6a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4z" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((r) => <rect key={r} x="10.9" y="1.4" width="2.2" height="4.8" rx="1.1" transform={`rotate(${r} 12 12)`} />)}
    </svg>
  );
}

export { React };
