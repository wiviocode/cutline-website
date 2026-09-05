/**
 * The renamer. What the app wants to know is which team you were there to photograph, and each
 * option shows the filename fragment it produces so the consequence is on screen before you
 * commit. A rename cannot be undone, so the button stops being a button the moment it is pressed.
 */

import React, { useEffect, useState } from "react";
import { useStore } from "../store";
import { Button } from "../components";
import { PhotoRenamer, type RenamePlan } from "@core/naming/PhotoRenamer";
import { HDSNaming } from "@core/naming/HDSNaming";
import { NamingPattern } from "@core/naming/NamingPattern";
import { isoDay, localDate } from "@core/images/PhotoMetadata";

export function RenamePanel({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [coveredIsHome, setCovered] = useState(true);
  const [date, setDate] = useState(isoDay(s.shootDate ?? new Date()));
  const [plan, setPlan] = useState<RenamePlan | null>(null);
  const [running, setRunning] = useState(false);
  const parsed = (() => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date); return m ? localDate(+m[1], +m[2], +m[3]) : new Date(); })();

  useEffect(() => { let alive = true; void s.renamePlan(parsed, coveredIsHome).then((p) => { if (alive) setPlan(p); }); return () => { alive = false; }; }, [date, coveredIsHome]); // eslint-disable-line react-hooks/exhaustive-deps

  const noTeams = s.rosterMode === "noTeams";
  const fixture = s.renameFixture(parsed, coveredIsHome);
  const available = !noTeams && !!fixture && !!s.folder?.writable;
  const frag = (home: boolean) => { const f = s.renameFixture(parsed, home); return f ? NamingPattern.stem(s.settings.namingPattern, f, 1) : ""; };
  const guesses = fixture ? [fixture.covered, fixture.opponent].filter((t) => !HDSNaming.schoolCode(t).isKnown).map((t) => `${t} → ${HDSNaming.schoolCode(t).code}`) : [];
  const changing = plan ? PhotoRenamer.changing(plan).length : 0;
  const companions = plan ? PhotoRenamer.changing(plan).reduce((n, i) => n + i.companions.length, 0) : 0;

  const reason = noTeams ? "An open event has no matchup to name files after." : !s.folder?.writable ? "This browser cannot rename files on disk. Use Chrome or Edge." : !fixture ? "This sport has no code in the naming convention." : "";

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !running) onClose(); }}>
      <div className="sheet" role="dialog" aria-label="Rename photographs">
        <header className="sheet-head"><h1>Rename photographs</h1></header>
        {!available ? (
          <div className="sheet-body"><div className={"warn" + (noTeams ? "" : " stop")}><span className="glyph">{noTeams ? "i" : "!"}</span><div>{reason}</div></div></div>
        ) : (
          <div className="sheet-body rename-body">
            <h2>Which team were you covering?</h2>
            <div className="card">
              <div className="sides">
                <button type="button" className={"side" + (coveredIsHome ? " on" : "")} onClick={() => setCovered(true)}><span className="team">{s.home.name}</span><span className="frag mono">{frag(true)}</span></button>
                <button type="button" className={"side" + (!coveredIsHome ? " on" : "")} onClick={() => setCovered(false)}><span className="team">{s.away.name}</span><span className="frag mono">{frag(false)}</span></button>
              </div>
              <div className="row"><span className="k">Game date</span><span className="c"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></span></div>
              <div className="row"><span className="k">Pattern</span><span className="c"><span className="pattern mono">{s.settings.namingPattern}</span></span></div>
            </div>
            {guesses.length > 0 && <div className="warn"><span className="glyph">?</span><div>Not in the school list, so the code was worked out from the name: {guesses.join(", ")}</div></div>}
            {plan && plan.problems.length > 0 && <div className="warn stop"><span className="glyph">!</span><div>{plan.problems.map((p, i) => <div key={i}>{p}</div>)}</div></div>}
            <h2>The plan <span className="count dim">{changing === 0 ? "nothing to move" : `${changing} photo${changing === 1 ? "" : "s"}${companions ? `, ${companions} sidecar and caption files with them` : ""}`}</span></h2>
            <div className="list">
              {plan?.items.slice(0, 200).map((item) => (
                <div key={item.source} className={"item" + (item.source === item.destination ? " same" : "")}>
                  <span className="from">{item.source}</span><span className="arrow">{item.source === item.destination ? "=" : "→"}</span><span className="to">{item.destination}</span>
                  {item.companions.length > 0 && <span className="extra">+{item.companions.length}</span>}
                </div>
              ))}
              {plan && plan.items.length > 200 && <div className="more">and {plan.items.length - 200} more, numbered on from here</div>}
            </div>
          </div>
        )}
        <footer className="sheet-foot">
          <span className="summary dim">{plan && plan.items.length - changing > 0 ? `${plan.items.length - changing} file${plan.items.length - changing === 1 ? "" : "s"} already named correctly` : ""}</span>
          <span className="spacer" />
          <Button variant="secondary" disabled={running} onClick={onClose}>{available ? "Cancel" : "Close"}</Button>
          {available && <Button disabled={!plan || !PhotoRenamer.isRunnable(plan) || running} onClick={async () => { if (!plan) return; setRunning(true); await s.applyRename(plan); setRunning(false); }}>{running ? "Renaming…" : `Rename ${changing} photo${changing === 1 ? "" : "s"}`}</Button>}
        </footer>
      </div>
    </div>
  );
}

export { React };
