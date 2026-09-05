/**
 * The shell: a title bar with where you are, one screen at a time, the two sheets, and a toast
 * for anything that needs saying. Everything sits inside an error boundary.
 */

import React, { useEffect } from "react";
import { useStore, type Screen } from "./store";
import { Button, Mark } from "./components";
import { ErrorBoundary } from "./ErrorBoundary";
import { Welcome } from "./screens/Welcome";
import { StartScreen } from "./screens/StartScreen";
import { GameScreen } from "./screens/GameScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { SettingsPanel } from "./screens/SettingsPanel";
import { RenamePanel } from "./screens/RenamePanel";

export function App() {
  const ready = useStore((s) => s.ready);
  const screen = useStore((s) => s.screen);
  const panel = useStore((s) => s.panel);
  const init = useStore((s) => s.init);
  const setPanel = useStore((s) => s.setPanel);
  useEffect(() => { void init(); }, [init]);

  return (
    <ErrorBoundary>
      <div className="app">
        {ready && screen !== "welcome" && <Titlebar />}
        {!ready && <div className="titlebar"><Mark /><span className="appname">Cutline</span></div>}
        {ready && screen === "welcome" && <Welcome />}
        {ready && screen === "start" && <StartScreen />}
        {ready && screen === "game" && <GameScreen />}
        {ready && screen === "review" && <ReviewScreen />}
        {panel === "settings" && <SettingsPanel onClose={() => setPanel(null)} />}
        {panel === "rename" && <RenamePanel onClose={() => setPanel(null)} />}
        <Toast />
      </div>
    </ErrorBoundary>
  );
}

const STEPS: { id: Screen; label: string }[] = [{ id: "start", label: "Photographs" }, { id: "game", label: "Game" }, { id: "review", label: "Review" }];

function Titlebar() {
  const screen = useStore((s) => s.screen);
  const writable = useStore((s) => s.writableFolders);
  const running = useStore((s) => s.isRunning);
  const setPanel = useStore((s) => s.setPanel);
  const at = STEPS.findIndex((st) => st.id === screen);
  return (
    <nav className="titlebar" aria-label="Cutline">
      <Mark />
      <span className="appname">Cutline</span>
      <span className="crumbs" aria-label="Where you are">
        {STEPS.map((st, i) => (
          <React.Fragment key={st.id}>
            {i > 0 && <i aria-hidden="true">›</i>}
            <span className={i === at ? "on" : i < at ? "done" : ""} aria-current={i === at ? "step" : undefined}>{st.label}</span>
          </React.Fragment>
        ))}
      </span>
      <span className="spacer" />
      {running && <span className="tag">captioning…</span>}
      {!writable && <span className="tag" title="Safari and Firefox can open photographs but cannot write captions into them. Chrome, Edge and Brave can.">read-only browser</span>}
      <Button variant="secondary" onClick={() => setPanel("settings")} title="Key, byline, model and output"><Gear />Settings</Button>
    </nav>
  );
}

function Toast() {
  const notice = useStore((s) => s.notice);
  const clear = useStore((s) => s.clearNotice);
  useEffect(() => {
    if (!notice || notice.kind !== "info") return;
    const t = setTimeout(clear, 7000);
    return () => clearTimeout(t);
  }, [notice, clear]);
  if (!notice) return null;
  return (
    <div className={`toast toast-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
      <span className="toast-glyph" aria-hidden="true">{notice.kind === "error" ? "!" : "i"}</span>
      <span>{notice.text}</span>
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={clear}>×</button>
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
