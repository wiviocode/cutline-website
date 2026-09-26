import { useEffect } from "react";
import { useStore, derive } from "./store";
import { Welcome } from "./screens/Welcome";
import { Setup } from "./screens/Setup";
import { Review } from "./screens/Review";
import { SettingsPanel } from "./screens/Settings";
import { Button, Mark } from "./components";
import { Cost } from "@core/ai/Models";

export function App() {
  const screen = useStore((s) => s.screen);
  const init = useStore((s) => s.init);
  const notice = useStore((s) => s.notice);
  const panel = useStore((s) => s.panel);
  useEffect(() => { void init(); }, [init]);

  return (
    <div className="app">
      {screen !== "welcome" && screen !== "loading" ? <TopBar /> : null}
      <main className="app-main">
        {screen === "loading" ? <div className="loading"><Mark size={40} /></div> : null}
        {screen === "welcome" ? <Welcome /> : null}
        {screen === "setup" ? <Setup /> : null}
        {screen === "review" ? <Review /> : null}
      </main>
      {panel === "settings" ? <SettingsPanel /> : null}
      {notice ? (
        <div className={`toast toast-${notice.kind}`} role="status">
          <span>{notice.text}</span>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => useStore.setState({ notice: null })}>×</button>
        </div>
      ) : null}
    </div>
  );
}

function TopBar() {
  const s = useStore();
  const counts = derive.counts(s);
  const { title, line } = derive.shootHeading(s);
  const share = (n: number) => `${(100 * n) / Math.max(1, counts.total)}%`;
  return (
    <header className="topbar">
      <div className="brand"><Mark size={24} /><span className="wordmark">Cutline</span></div>
      {s.folder ? (
        <nav className="tabs" aria-label="Steps">
          <button type="button" className={`tab${s.screen === "setup" ? " tab-on" : ""}`} onClick={() => s.setScreen("setup")}>Setup</button>
          <button type="button" className={`tab${s.screen === "review" ? " tab-on" : ""}`} onClick={() => s.setScreen("review")} disabled={!counts.done && !s.running}>
            Review{counts.done ? <span className="tab-count">{counts.approved}/{counts.total}</span> : null}
          </button>
        </nav>
      ) : null}
      {s.folder ? <div className="shoot"><b>{title}</b><span>{line}</span></div> : null}
      <div className="topbar-right">
        {s.folder && counts.done ? (
          <div className="prog" title={`${counts.approved} approved · ${counts.done - counts.approved - counts.review} read · ${counts.review} to check · ${counts.pending} not read`}>
            <span>{counts.approved} of {counts.total} approved{s.spent ? ` · ${Cost.dollars(s.spent)}` : ""}</span>
            <span className="progbar"><i style={{ width: share(counts.approved), background: "var(--ok)" }} /><i style={{ width: share(counts.done - counts.approved - counts.review), background: "var(--read)" }} /><i style={{ width: share(counts.review), background: "var(--check)" }} /></span>
          </div>
        ) : null}
        {s.folder ? <Button kind="ghost" small onClick={() => s.closeShoot()}>Close shoot</Button> : null}
        <button type="button" className="icon-btn gear" aria-label="Settings" title="Settings" onClick={() => s.setPanel("settings")}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </button>
      </div>
    </header>
  );
}
