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
  return (
    <header className="topbar">
      <div className="topbar-left">
        <Mark />
        <span className="wordmark">Cutline</span>
        {s.folder ? (
          <nav className="tabs" aria-label="Steps">
            <button type="button" className={`tab${s.screen === "setup" ? " tab-on" : ""}`} onClick={() => s.setScreen("setup")}>Setup</button>
            <button type="button" className={`tab${s.screen === "review" ? " tab-on" : ""}`} onClick={() => s.setScreen("review")} disabled={!counts.done && !s.running}>
              Review{counts.done ? <span className="tab-count">{counts.approved}/{counts.total}</span> : null}
            </button>
          </nav>
        ) : null}
      </div>
      <div className="topbar-right">
        {s.folder ? <span className="meta" title="Spent on this shoot in this session">{s.folder.name} · {counts.total} photos{s.spent ? ` · ${Cost.dollars(s.spent)}` : ""}</span> : null}
        {s.folder ? <Button kind="ghost" small onClick={() => s.closeShoot()}>Close shoot</Button> : null}
        <Button kind="ghost" small onClick={() => s.setPanel("settings")} aria-label="Settings">Settings</Button>
      </div>
    </header>
  );
}
