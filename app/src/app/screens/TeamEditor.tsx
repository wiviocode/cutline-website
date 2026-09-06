/**
 * One side of the fixture: its name, the colour it wore, and where its roster comes from — a
 * team page read through the relay, the page's text pasted by hand, a CSV, or a team already
 * in the library.
 */

import React, { useRef, useState } from "react";
import { useStore, type Side } from "../store";
import { Button, Callout, Crest, Field, Overline, Sheet, TextArea, TextInput, swatchColour } from "../components";
import { SavedTeam } from "@core/roster/SavedTeam";
import { COLOUR_SYNONYMS } from "@core/roster/TeamColorArbiter";

const COLOURS = Object.keys(COLOUR_SYNONYMS);

export function TeamEditor({ side, onClose }: { side: Side; onClose: () => void }) {
  const s = useStore();
  const st = s[side];
  const [paste, setPaste] = useState(false);
  const [pasted, setPasted] = useState("");
  const csv = useRef<HTMLInputElement>(null);
  const im = s.imports[side];
  const busy = im.busy;
  const matching = s.library.filter((t) => t.sport === s.selection.sportID && t.gender === s.selection.gender && t.level === s.selection.level);
  const canFetch = s.relay !== false;

  return (
    <Sheet title={side === "home" ? "Home team" : "Away team"} onClose={onClose} footer={<>
      {busy && <span className="dim small">Reading carries on if you close this — set up the other side meanwhile.</span>}
      <span className="spacer" /><Button onClick={onClose}>Done</Button></>}>
      <div className="card stack">
        <Field label="Team">
          <TextInput value={st.name} placeholder="Nebraska Cornhuskers" autoFocus={!st.name} onChange={(e) => s.setSide(side, { name: e.target.value })} />
        </Field>
        <Field label="Kit colour" hint={<>The colour of the jersey's body in <em>this</em> game, not the school's colours — it is what puts a number on the right side. Words the matcher knows: {COLOURS.join(", ")}.</>}>
          <div className="keyrow">
            <span className="swatch" style={{ background: swatchColour(st.colour), width: 18, height: 18 }} aria-hidden="true" />
            <TextInput value={st.colour} placeholder="white" style={{ width: 140 }} onChange={(e) => s.setSide(side, { colour: e.target.value })} ariaLabel="Kit colour" />
          </div>
        </Field>
      </div>

      {s.rosterMode === "rosters" && (
        <section className="section" aria-labelledby={`t-roster-${side}`}>
          <div className="section-head"><Overline><span id={`t-roster-${side}`}>Roster</span></Overline><span className="hint">Read from the team's own page, pasted, from a CSV, or from your library.</span></div>
          <div className="card stack">
            <Field label="Team page" hint={canFetch ? "Any page on the team's site will do — the roster page for this sport and gender is worked out from it." : "The page relay is not reachable from here, so a link cannot be fetched. Paste the page's text instead."}>
              <div className="keyrow">
                <TextInput value={st.rosterURL} placeholder="https://huskers.com/sports/soccer/roster" disabled={busy} spellCheck={false}
                  onChange={(e) => s.setSide(side, { rosterURL: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && canFetch) void s.importTeam(side); }} ariaLabel="Team page address" />
                <Button disabled={busy || !st.rosterURL.trim() || !canFetch} onClick={() => void s.importTeam(side)}>{busy ? "Reading…" : "Read"}</Button>
              </div>
            </Field>
            <div className="keyrow">
              <Button variant="secondary" disabled={busy} onClick={() => setPaste((p) => !p)}>{paste ? "Hide" : "Paste the page's text…"}</Button>
              <Button variant="secondary" disabled={busy} onClick={() => csv.current?.click()}>Roster CSV…</Button>
              <input ref={csv} type="file" accept=".csv,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) await s.importCSV(side, await f.text(), st.name); e.target.value = ""; }} />
            </div>
            {paste && (
              <div className="stack">
                <TextArea value={pasted} minHeight={120} placeholder="Open the team's roster page in another tab, select all, copy, and paste it here. Names, numbers and positions are read out of it." onChange={(e) => setPasted(e.target.value)} ariaLabel="Pasted roster page" />
                <div className="keyrow"><span className="spacer" /><Button disabled={busy || pasted.trim().length < 40} onClick={() => void s.importTeamFromHTML(side, pasted).then(() => setPasted(""))}>Read the roster</Button></div>
              </div>
            )}
            {(im.status || busy) && <p className={"note" + (busy ? " busy-note" : "")} role="status" aria-live="polite">{busy && <span className="busy-dot" aria-hidden="true" />}{im.status}</p>}
            {im.error && <Callout kind="warn">{im.error}</Callout>}
            {im.warnings.map((w, i) => <Callout key={i} kind="note">{w}</Callout>)}
            {st.team && (
              <div className="lib-row">
                <Crest name={SavedTeam.fullName(st.team)} colour={st.colour} logoURL={s.logoURLs[st.team.id]} size={26} />
                <span className="name"><b>{SavedTeam.fullName(st.team)}</b> <span className="dim">· {st.team.players.length} player{st.team.players.length === 1 ? "" : "s"}</span></span>
                <Button variant="ghost" onClick={() => s.clearTeam(side)}>Detach</Button>
              </div>
            )}
            {st.team && st.team.players.length > 0 && (
              <div className="roster-list">
                {st.team.players.slice(0, 60).map((p, i) => (
                  <span key={i} className="roster-row"><span className="mono">#{p.jerseyNumber || "—"}</span> {p.firstName} {p.lastName}{p.position ? <span className="dim"> · {p.position}{p.secondaryPosition ? ` / ${p.secondaryPosition}` : ""}</span> : null}</span>
                ))}
                {st.team.players.length > 60 && <span className="dim small">and {st.team.players.length - 60} more</span>}
              </div>
            )}
          </div>

          {matching.length > 0 && (
            <>
              <div className="section-head" style={{ marginTop: 8 }}><Overline>From your library</Overline><span className="hint">Read once this season; no request is made.</span></div>
              <div className="card rows">
                {matching.map((t) => (
                  <div key={t.id} className="lib-row">
                    <Crest name={SavedTeam.fullName(t)} colour={st.team?.id === t.id ? st.colour : "grey"} logoURL={s.logoURLs[t.id]} size={26} />
                    <span className="name">{SavedTeam.fullName(t)} <span className="dim">· {t.players.length} player{t.players.length === 1 ? "" : "s"}</span></span>
                    <Button variant="secondary" onClick={() => s.pickLibraryTeam(side, t)}>Use</Button>
                    <button type="button" className="linky" onClick={() => void s.forgetTeam(t)}>Forget</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </Sheet>
  );
}

export { React };
