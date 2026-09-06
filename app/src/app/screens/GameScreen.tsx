/**
 * Who played, and where. One scrolling page: the photographs already chosen, what was played,
 * the two sides (or the event), the venue and notes. The footer says in words what is still
 * missing, then Continue.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore, derive, thumbnails, THUMB_EDGE, type Side } from "../store";
import { Button, Callout, Crest, Field, Overline, Select, TextArea, TextInput, swatchColour } from "../components";
import { Levels, RosterModes, SportCatalogue, genderLabel, type Gender, type Level, type RosterMode } from "@core/setup/GameLibrary";
import { TeamEditor } from "./TeamEditor";
import { useShortcuts } from "../shortcuts";

export function GameScreen() {
  const s = useStore();
  const [editing, setEditing] = useState<Side | null>(null);
  const blocking = derive.blockingReason(s);
  const noTeams = derive.noTeams(s);

  useShortcuts({
    "mod+Enter": () => { if (!blocking) void s.continueToReview(); },
    "mod+o": () => void s.chooseFolder(false),
  }, !s.panel && !editing);

  const rosterNote = s.rosterMode === "rosters" ? "rosters loaded" : s.rosterMode === "noRosters" ? "no rosters" : "open event";

  return (
    <div className="screen">
      <div className="scroll">
        <div className="column">
          <Photographs />

          <section className="section" aria-labelledby="g-played">
            <div className="section-head"><Overline><span id="g-played">What was played</span></Overline><span className="hint">{RosterModes.find((m) => m.id === s.rosterMode)?.explanation}</span></div>
            <div className="card">
              <div className="selects">
                <Select<Level> value={s.selection.level} options={Levels.map((l) => ({ id: l.id, name: l.label }))} onChange={(v) => s.setLevel(v)} ariaLabel="Level" />
                {!noTeams && <Select value={s.selection.sportID} options={SportCatalogue.options(s.selection.level).map((o) => ({ id: o.sport, name: o.name }))} onChange={(v) => s.setSport(v)} ariaLabel="Sport" />}
                {!noTeams && <GenderSelect />}
                <Select<RosterMode> value={s.rosterMode} options={RosterModes.map((m) => ({ id: m.id, name: m.label }))} onChange={(v) => s.setRosterMode(v)} ariaLabel="Team information" />
              </div>
            </div>
          </section>

          {noTeams ? (
            <section className="section" aria-labelledby="g-event">
              <div className="section-head"><Overline><span id="g-event">The event</span></Overline></div>
              <div className="card stack">
                <Field label="Event" hint="Named in every caption in place of a matchup.">
                  <TextInput value={s.eventName} placeholder="the Nebraska State Cyclocross Championships" onChange={(e) => s.setFields({ eventName: e.target.value })} />
                </Field>
                <Field label="What one competitor is called" hint="rider, runner, wrestler — blank means competitor.">
                  <TextInput value={s.participantNoun} placeholder="rider" onChange={(e) => s.setFields({ participantNoun: e.target.value })} />
                </Field>
              </div>
            </section>
          ) : (
            <section className="section" aria-labelledby="g-who">
              <div className="section-head"><Overline><span id="g-who">Who played</span></Overline><span className="hint">Click a side to name it, set its kit colour, and attach a roster.</span></div>
              <div className="matchup">
                <TeamCard side="home" onEdit={() => setEditing("home")} />
                <span className="vs" aria-hidden="true">VS</span>
                <TeamCard side="away" onEdit={() => setEditing("away")} />
              </div>
              {(["home", "away"] as Side[]).filter((side) => s.imports[side].error).map((side) => (
                <Callout key={side} kind="warn"><b>{s[side].name || (side === "home" ? "Home" : "Away")}:</b> {s.imports[side].error}</Callout>
              ))}
            </section>
          )}

          <section className="section" aria-labelledby="g-where">
            <div className="section-head"><Overline><span id="g-where">Where, and what the photograph cannot show</span></Overline></div>
            <div className="card stack">
              <Field label="Venue"><TextInput value={s.venue} placeholder="Memorial Stadium" onChange={(e) => s.setFields({ venue: e.target.value })} /></Field>
              <div className="field-row">
                <Field label="City"><TextInput value={s.city} placeholder="Lincoln" onChange={(e) => s.setFields({ city: e.target.value })} /></Field>
                <Field label="State"><TextInput value={s.state} placeholder="Neb." onChange={(e) => s.setFields({ state: e.target.value })} /></Field>
              </div>
              <Field label="Notes to the model" hint="A change kit, a returning starter in a new number, which end they attacked. Sent with every frame.">
                <TextArea value={s.notes} minHeight={60} rows={2} placeholder="Nebraska in white, Ohio State in red. Cold night, first game after the bye." onChange={(e) => s.setFields({ notes: e.target.value })} />
              </Field>
              <Filed />
            </div>
          </section>
        </div>
      </div>

      <footer className="bar">
        <span className="status">{blocking ?? <><span className="ready-dot" aria-hidden="true" />Ready — {s.photoCount} photograph{s.photoCount === 1 ? "" : "s"}, {rosterNote}</>}</span>
        <Button variant="ghost" onClick={() => s.startOver()}>Start over</Button>
        <Button disabled={!!blocking} onClick={() => void s.continueToReview()} title="⌘⏎">Continue</Button>
      </footer>
      {editing && <TeamEditor side={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function GenderSelect() {
  const s = useStore();
  const sport = SportCatalogue.option(s.selection.sportID, s.selection.level);
  const genders = sport?.genders ?? ["mens", "womens"];
  if (genders.length < 2) return null;
  return <Select<Gender> value={s.selection.gender} options={genders.map((g) => ({ id: g, name: genderLabel(g, s.selection.level) }))} onChange={(v) => s.setGender(v)} ariaLabel="Men's or women's" />;
}

function Photographs() {
  const s = useStore();
  const input = useRef<HTMLInputElement>(null);
  const change = () => { if (s.writableFolders) void s.chooseFolder(false); else input.current?.click(); };
  const picker = (
    <input ref={input} type="file" multiple hidden {...({ webkitdirectory: "" } as object)}
      onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) void s.useFiles(files, false); e.target.value = ""; }} />
  );
  if (!s.folder) {
    return (
      <section className="section" aria-labelledby="g-photos">
        <div className="section-head"><Overline><span id="g-photos">Photographs</span></Overline></div>
        <Callout kind="note" actions={<Button onClick={change}>Choose the folder…</Button>}>
          The rest of this shoot is filled in. Choose its folder of photographs to carry on.
        </Callout>
        {picker}
      </section>
    );
  }
  const date = s.shootDate ? s.shootDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "no capture dates found";
  return (
    <section className="section" aria-labelledby="g-photos">
      <div className="section-head"><Overline><span id="g-photos">Photographs</span></Overline></div>
      <div className="card photorow">
        <Thumbs />
        <span className="who">
          <b>{s.folder.name} — {s.photoCount} photograph{s.photoCount === 1 ? "" : "s"}</b>
          <span>{date}{!s.folder.writable ? " · read-only in this browser" : ""}</span>
        </span>
        <Button variant="secondary" onClick={change}>Change</Button>
        {picker}
      </div>
    </section>
  );
}

/** Three thumbnails. Keyed on the folder and the first three names, not on the frame list. */
function Thumbs() {
  const folder = useStore((s) => s.folder);
  const frames = useStore((s) => s.frames);
  const first = useMemo(() => frames.slice(0, 3).map((f) => ({ id: f.id, photo: f.photo })), [frames]);
  const key = first.map((f) => f.id).join("\n");
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    setUrls({});
    for (const f of first) void thumbnails.url(f.id, () => f.photo.file(), THUMB_EDGE).then((u) => { if (alive) setUrls((x) => ({ ...x, [f.id]: u })); }).catch(() => {});
    return () => { alive = false; };
  }, [folder, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span className="thumbs" aria-hidden="true">{first.map((f) => (urls[f.id] ? <img key={f.id} src={urls[f.id]} alt="" /> : <i key={f.id} />))}</span>;
}

function TeamCard({ side, onEdit }: { side: Side; onEdit: () => void }) {
  const st = useStore((s) => s[side]);
  const logoURLs = useStore((s) => s.logoURLs);
  const rosterMode = useStore((s) => s.rosterMode);
  const busy = useStore((s) => s.imports[side].busy);
  const label = side === "home" ? "Home" : "Away";
  if (!st.name) return <button type="button" className="teamcard empty" onClick={onEdit}>Name the {label.toLowerCase()} team</button>;
  const roster = busy ? "reading the roster…" : rosterMode === "rosters" ? (st.team ? `${st.team.players.length} player${st.team.players.length === 1 ? "" : "s"}` : "no roster yet") : "no roster";
  return (
    <button type="button" className={"teamcard" + (busy ? " busy" : "")} onClick={onEdit} aria-label={`${label} team: ${st.name}`}>
      <Crest name={st.name} colour={st.colour} logoURL={st.team ? logoURLs[st.team.id] : null} size={40} />
      <span style={{ minWidth: 0 }}>
        <span className="tc-name">{st.name}</span>
        <span className="tc-meta"><span className="swatch" style={{ background: swatchColour(st.colour) }} />{st.colour || "no colour"} · {roster}</span>
      </span>
    </button>
  );
}

function Filed() {
  const s = useStore();
  const codes = [`Category S`, `Supp Cat ${derive.deskFields(s).supplementalCategory ?? "—"}`, s.settings.templateName ? `${s.settings.templateName} template` : "no template"].join(" · ");
  const file = derive.filenamePreview(s);
  return (
    <div className="filed" aria-label="What gets filed">
      <div className="row"><span className="k">Headline</span><span className="v">{derive.descriptorPreview(s)}</span></div>
      <div className="row"><span className="k">Codes</span><span className="v mono">{codes}</span></div>
      {file && <div className="row"><span className="k">File</span><span className="v mono">{file}</span></div>}
    </div>
  );
}

export { React };
