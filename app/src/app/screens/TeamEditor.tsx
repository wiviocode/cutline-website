/**
 * One side of the fixture: its name, its kit colour, and where its roster comes from — a pasted
 * link read through the relay, the page's text pasted by hand, a CSV, or a team already in the
 * library.
 */

import React, { useRef, useState } from "react";
import { useStore, derive, type Side } from "../store";
import { Button, Overline, TextArea, TextInput, Crest, swatchColour } from "../components";
import { SavedTeam } from "@core/roster/SavedTeam";
import { COLOUR_SYNONYMS } from "@core/roster/TeamColorArbiter";

const COLOURS = Object.keys(COLOUR_SYNONYMS);

export function TeamEditor({ side, onClose }: { side: Side; onClose: () => void }) {
  const s = useStore();
  const st = s[side];
  const [paste, setPaste] = useState(false);
  const [pasted, setPasted] = useState("");
  const csv = useRef<HTMLInputElement>(null);
  const rosterMode = s.rosterMode;
  const matching = s.library.filter((t) => t.sport === s.selection.sportID && t.gender === s.selection.gender && t.level === s.selection.level);
  const busy = s.importing === side;

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-label={`${side} team`}>
        <header className="sheet-head">
          <h1>{side === "home" ? "Home team" : "Away team"}</h1>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>Done</Button>
        </header>
        <div className="sheet-body">
          <div className="card">
            <div className="row"><span className="k">Name</span><span className="c" style={{ width: 300 }}><TextInput value={st.name} placeholder="Nebraska Cornhuskers" onChange={(e) => s.setSide(side, { name: e.target.value })} /></span></div>
            <div className="row">
              <span className="k">Kit colour</span>
              <span className="c">
                <span className="swatch" style={{ background: swatchColour(st.colour) }} />
                <TextInput value={st.colour} placeholder="white" style={{ width: 120 }} onChange={(e) => s.setSide(side, { colour: e.target.value })} />
              </span>
            </div>
            <p className="note">The colour of the jersey's body panel in <em>this</em> game — not the school's colours. It is the only thing that puts a number on the right side. Words the matcher knows: {COLOURS.join(", ")}.</p>
          </div>

          {rosterMode === "rosters" && (
            <>
              <Overline style={{ margin: "16px 0 7px" }}>Roster</Overline>
              <div className="card">
                <div className="row">
                  <span className="k">Team page</span>
                  <span className="c" style={{ flex: 1 }}>
                    <TextInput value={st.rosterURL} placeholder="a link to the team's site — any page will do" onChange={(e) => s.setSide(side, { rosterURL: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") void s.importTeam(side); }} disabled={busy} />
                    <Button disabled={busy || !st.rosterURL.trim() || s.relay === false} onClick={() => void s.importTeam(side)}>{busy ? "Reading…" : "Get"}</Button>
                  </span>
                </div>
                {s.relay === false && <p className="note">The page relay is not reachable from here, so a link cannot be fetched. Paste the page's text instead.</p>}
                <div className="row">
                  <span className="k">Or</span>
                  <span className="c">
                    <Button variant="secondary" onClick={() => setPaste((p) => !p)}>{paste ? "Hide" : "Paste the page's text…"}</Button>
                    <Button variant="secondary" onClick={() => csv.current?.click()}>Roster CSV…</Button>
                    <input ref={csv} type="file" accept=".csv,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) await s.importCSV(side, await f.text(), st.name); e.target.value = ""; }} />
                  </span>
                </div>
                {paste && (
                  <div className="row stacked">
                    <TextArea value={pasted} minHeight={120} placeholder="Open the team's roster page in another tab, select all, copy, and paste it here. Names, numbers and positions are read out of it." onChange={(e) => setPasted(e.target.value)} />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <Button disabled={busy || pasted.trim().length < 40} onClick={() => void s.importTeamFromHTML(side, pasted).then(() => setPasted(""))}>Read the roster</Button>
                    </div>
                  </div>
                )}
                {(s.importStatus || busy) && <p className={"note" + (busy ? " busy" : "")}>{s.importStatus}</p>}
                {s.importWarnings.map((w, i) => <p key={i} className="note warn-text">{w}</p>)}
                {st.team && (
                  <div className="row">
                    <span className="k">{SavedTeam.fullName(st.team)} — {st.team.players.length} player{st.team.players.length === 1 ? "" : "s"}</span>
                    <span className="c">
                      <Button variant="ghost" onClick={() => s.clearTeam(side)}>Detach</Button>
                    </span>
                  </div>
                )}
                {st.team && st.team.players.length > 0 && (
                  <div className="roster-list">
                    {st.team.players.slice(0, 60).map((p, i) => (
                      <span key={i} className="roster-row"><span className="mono">#{p.jerseyNumber || "—"}</span> {p.firstName} {p.lastName}{p.position ? <span className="dim"> · {p.position}</span> : null}</span>
                    ))}
                    {st.team.players.length > 60 && <span className="dim small">and {st.team.players.length - 60} more</span>}
                  </div>
                )}
              </div>

              {matching.length > 0 && (
                <>
                  <Overline style={{ margin: "16px 0 7px" }}>From the library</Overline>
                  <div className="card">
                    {matching.map((t) => (
                      <div key={t.id} className="row library-row">
                        <Crest name={SavedTeam.fullName(t)} colour={t.identity.colorHexes.length ? (derive.nameParts(s, side), st.colour) : "grey"} logoURL={s.logoURLs[t.id]} size={26} />
                        <span className="k" style={{ marginLeft: 8 }}>{SavedTeam.fullName(t)} <span className="dim">· {t.players.length} player{t.players.length === 1 ? "" : "s"}</span></span>
                        <span className="c">
                          <Button variant="secondary" onClick={() => s.pickLibraryTeam(side, t)}>Use</Button>
                          <button type="button" className="linky" onClick={() => void s.forgetTeam(t)}>Forget</button>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export { React };
