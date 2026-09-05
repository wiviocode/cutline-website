/**
 * The renamer. What the app wants to know is which team you were there to photograph, and each
 * option shows the filename fragment it produces so the consequence is on screen before you
 * commit. A rename cannot be undone, so the sheet locks while it runs.
 */

import React, { useEffect, useState } from "react";
import { useStore } from "../store";
import { Button, Callout, Overline, Sheet } from "../components";
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
  const unchanged = plan ? plan.items.length - changing : 0;
  const reason = noTeams ? "An open event has no matchup to name files after." : !s.folder?.writable ? "This browser cannot rename files on disk. Chrome, Edge and Brave can." : !fixture ? "This sport has no code in the naming convention." : "";

  return (
    <Sheet title="Rename photographs" onClose={onClose} busy={running} size="lg"
      footer={<>
        <span className="dim small">{unchanged > 0 ? `${unchanged} file${unchanged === 1 ? "" : "s"} already named correctly` : ""}</span>
        <span className="spacer" />
        <Button variant="secondary" disabled={running} onClick={onClose}>{available ? "Cancel" : "Close"}</Button>
        {available && <Button disabled={!plan || !PhotoRenamer.isRunnable(plan) || running || changing === 0} onClick={async () => { if (!plan) return; setRunning(true); await s.applyRename(plan); setRunning(false); }}>{running ? "Renaming…" : `Rename ${changing} photo${changing === 1 ? "" : "s"}`}</Button>}
      </>}>
      {!available ? (
        <Callout kind={noTeams ? "note" : "stop"}>{reason}</Callout>
      ) : (
        <>
          <section className="section">
            <div className="section-head"><Overline>Which team were you covering?</Overline><span className="hint">The covered team leads the name; v when they hosted, at when they travelled.</span></div>
            <div className="card stack">
              <div className="sides" role="radiogroup" aria-label="Covered team">
                <button type="button" role="radio" aria-checked={coveredIsHome} className={"side" + (coveredIsHome ? " on" : "")} onClick={() => setCovered(true)}><span className="team">{s.home.name}</span><span className="frag">{frag(true)}</span></button>
                <button type="button" role="radio" aria-checked={!coveredIsHome} className={"side" + (!coveredIsHome ? " on" : "")} onClick={() => setCovered(false)}><span className="team">{s.away.name}</span><span className="frag">{frag(false)}</span></button>
              </div>
              <div className="rows">
                <div className="row"><span className="k">Game date</span><span className="c"><input className="input" type="date" value={date} style={{ width: "auto" }} aria-label="Game date" onChange={(e) => setDate(e.target.value)} /></span></div>
                <div className="row"><span className="k">Pattern<small className="mono">{s.settings.namingPattern}</small></span><span className="c"><span className="dim small">change it in Settings</span></span></div>
              </div>
            </div>
          </section>
          {guesses.length > 0 && <Callout kind="warn">Not in the school list, so the code was worked out from the name: {guesses.join(", ")}</Callout>}
          {plan && plan.problems.length > 0 && <Callout kind="stop">{plan.problems.map((p, i) => <div key={i}>{p}</div>)}</Callout>}
          <section className="section">
            <div className="section-head"><Overline>The plan</Overline><span className="hint">{changing === 0 ? "nothing to move" : `${changing} photo${changing === 1 ? "" : "s"}${companions ? `, ${companions} sidecar and caption files with them` : ""}`}</span></div>
            <div className="list">
              {plan?.items.slice(0, 200).map((item) => (
                <div key={item.source} className={"item" + (item.source === item.destination ? " same" : "")}>
                  <span className="from">{item.source}</span><span className="arrow">{item.source === item.destination ? "=" : "→"}</span><span className="to">{item.destination}</span>
                  {item.companions.length > 0 && <span className="extra">+{item.companions.length}</span>}
                </div>
              ))}
              {plan && plan.items.length > 200 && <div className="more">and {plan.items.length - 200} more, numbered on from here</div>}
              {!plan && <div className="more">Working out the plan…</div>}
            </div>
          </section>
        </>
      )}
    </Sheet>
  );
}

export { React };
