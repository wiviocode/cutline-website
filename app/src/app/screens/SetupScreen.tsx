/**
 * The setup screen. Photographs first, then who was playing, then how it gets filed — the order
 * the work actually happens in when a card comes home. With the folder in hand it reads the
 * capture date off the frames and fills most of the rest in.
 */

import React, { useEffect, useRef, useState } from "react";
import { useStore, derive, thumbnails, THUMB_EDGE, type Side } from "../store";
import { Button, Overline, Select, TextArea, TextInput, Crest, swatchColour } from "../components";
import { Levels, RosterModes, SportCatalogue, genderLabel, RecentGame, type Gender } from "@core/setup/GameLibrary";
import { HurrdatFields } from "@core/metadata/HurrdatFields";
import { TeamEditor } from "./TeamEditor";
import { HandleFolder } from "@platform/fs";

export function SetupScreen() {
  const s = useStore();
  const [editing, setEditing] = useState<Side | null>(null);
  const hasFolder = derive.hasFolder(s);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "o") { e.preventDefault(); void s.chooseFolder(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && derive.canContinue(s)) { e.preventDefault(); void s.continueToReview(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="screen">
      <main className="setup-main">
        {!hasFolder ? <Launch /> : <Steps onEditTeam={setEditing} />}
      </main>
      {hasFolder && (
        <footer className="bar bar-bottom">
          <span className="status">{footerStatus(s)}</span>
          <span className="spacer" />
          <Button variant="secondary" onClick={() => s.startOver()}>Start over</Button>
          <Button disabled={!derive.canContinue(s)} onClick={() => void s.continueToReview()}>Continue</Button>
        </footer>
      )}
      {editing && <TeamEditor side={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function footerStatus(s: ReturnType<typeof useStore.getState>): React.ReactNode {
  const blocking = derive.blockingReason(s);
  if (blocking) return blocking;
  const roster = s.rosterMode === "rosters" ? ", rosters loaded" : s.rosterMode === "noRosters" ? ", no rosters" : "";
  return <><span className="ready-dot" />Ready — {s.photoCount} photos{roster}</>;
}

function Launch() {
  const s = useStore();
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setOver(false);
    const item = e.dataTransfer.items?.[0];
    if (item && "getAsFileSystemHandle" in item) {
      const handle = await (item as DataTransferItem & { getAsFileSystemHandle(): Promise<FileSystemHandle | null> }).getAsFileSystemHandle();
      if (handle && handle.kind === "directory") {
        await s.useFolder(new HandleFolder(handle as FileSystemDirectoryHandle));
        return;
      }
    }
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) await s.useFiles(files);
  };

  const choose = () => { if (s.writableFolders) void s.chooseFolder(); else input.current?.click(); };

  return (
    <div className="launch">
      <div className={"drop" + (over ? " over" : "")} onClick={choose}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => void onDrop(e)}>
        <div className="art"><i /><i /><i /></div>
        <div className="t">Drop a folder of photographs</div>
        <div className="s">or press ⌘O · JPEG, PNG and raw files</div>
        {!s.writableFolders && <div className="s warn-text">This browser can read your photographs but not write captions into them. Chrome or Edge can do both.</div>}
        <input ref={input} type="file" multiple hidden {...({ webkitdirectory: "" } as object)}
          onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) void s.useFiles(files); e.target.value = ""; }} />
      </div>
      {s.recents.length > 0 && (
        <div className="recents">
          <Overline>Recent shoots</Overline>
          <div className="recard-row">
            {s.recents.map((r) => (
              <div key={r.id} className="recard" onClick={() => void s.openRecent(r)}>
                <span className="pair"><i style={{ background: swatchColour(r.homeColor) }} /><i style={{ background: swatchColour(r.awayColor) }} /></span>
                <span className="t">{RecentGame.title(r)}</span>
                <span className="s">{[RecentGame.sportLabel(r), r.photosFolder].filter(Boolean).join(" · ") || "—"}</span>
                <button type="button" className="linky" onClick={(e) => { e.stopPropagation(); void s.forgetRecent(r); }}>Forget</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Steps({ onEditTeam }: { onEditTeam: (side: Side) => void }) {
  const s = useStore();
  const noTeams = derive.noTeams(s);
  const matchupReady = noTeams ? !!s.eventName.trim() : !!s.home.name.trim() && !!s.away.name.trim();
  const sport = SportCatalogue.option(s.selection.sportID, s.selection.level);
  const genderOptions = (sport?.genders ?? ["mens", "womens"]).map((g) => ({ id: g, name: genderLabel(g, s.selection.level) }));
  const codes = [`Category S`, `Supp Cat ${derive.deskFields(s).supplementalCategory ?? "—"}`, s.settings.templateName ? `${s.settings.templateName} template` : "no template"].join(" · ");

  return (
    <div className="steps">
      <Step n={1} done={s.photoCount > 0} title="Photographs" hint={s.shootDate ? `read off the card` : ""}>
        <div className="card photorow">
          <Thumbs />
          <span className="who">
            <b>{s.folder?.name} — {s.photoCount} photographs</b>
            <span>{s.shootDate ? s.shootDate.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "no capture dates found"}{!s.folder?.writable ? " · read-only in this browser" : ""}</span>
          </span>
          <span className="spacer" />
          <Button variant="secondary" onClick={() => void s.chooseFolder()}>Change</Button>
        </div>
      </Step>

      <Step n={2} done={matchupReady} title={noTeams ? "Event" : "Matchup"} hint={noTeams ? derive.eventTitle(s) : `${Levels.find((l) => l.id === s.selection.level)?.shortLabel} · ${derive.sportLabel(s)} · ${s.rosterMode === "rosters" ? "rosters" : "no rosters"}`}>
        <div className="selects">
          <Select value={s.selection.level} options={Levels.map((l) => ({ id: l.id, name: l.label }))} onChange={(v) => s.setLevel(v)} />
          {!noTeams && <Select value={s.selection.sportID} options={SportCatalogue.options(s.selection.level).map((o) => ({ id: o.sport, name: o.name }))} onChange={(v) => s.setSport(v)} />}
          {!noTeams && genderOptions.length > 1 && <Select value={s.selection.gender} options={genderOptions} onChange={(v) => s.setGender(v as Gender)} />}
          <Select value={s.rosterMode} options={RosterModes.map((m) => ({ id: m.id, name: m.label }))} onChange={(v) => s.setRosterMode(v)} />
        </div>
        <div className="dim small">{RosterModes.find((m) => m.id === s.rosterMode)?.explanation}</div>
        {noTeams ? (
          <div className="card meta">
            <label className="field"><span>Event</span><TextInput value={s.eventName} placeholder="the Nebraska State Cyclocross Championships" onChange={(e) => s.setFields({ eventName: e.target.value })} /></label>
            <label className="field"><span>What one competitor is called</span><TextInput value={s.participantNoun} placeholder="rider, runner, wrestler — blank means competitor" onChange={(e) => s.setFields({ participantNoun: e.target.value })} /></label>
          </div>
        ) : (
          <div className="matchup">
            <TeamCard side="home" onEdit={() => onEditTeam("home")} />
            <span className="vs">VS</span>
            <TeamCard side="away" onEdit={() => onEditTeam("away")} />
          </div>
        )}
        {s.importError && <div className="trouble">{s.importError}</div>}
      </Step>

      <Step n={3} done={false} title="Venue and notes">
        <div className="card meta">
          <label className="field"><span>Venue</span><TextInput value={s.venue} placeholder="Memorial Stadium" onChange={(e) => s.setFields({ venue: e.target.value })} /></label>
          <div className="field-row">
            <label className="field"><span>City</span><TextInput value={s.city} placeholder="Lincoln" onChange={(e) => s.setFields({ city: e.target.value })} /></label>
            <label className="field"><span>State</span><TextInput value={s.state} placeholder="Neb." onChange={(e) => s.setFields({ state: e.target.value })} /></label>
          </div>
          <label className="field"><span>Notes</span>
            <TextArea value={s.notes} minHeight={54} rows={2} placeholder="What the photograph cannot show — a change kit, the occasion, which end they attacked" onChange={(e) => s.setFields({ notes: e.target.value })} />
          </label>
          <div className="filed-out">
            <div className="row"><span className="k">Headline</span><span className="v">{derive.descriptorPreview(s)}</span></div>
            <div className="row"><span className="k">Codes</span><span className="v mono">{codes}</span></div>
            {derive.filenamePreview(s) && <div className="row"><span className="k">File</span><span className="v mono">{derive.filenamePreview(s)}</span></div>}
          </div>
        </div>
      </Step>
    </div>
  );
}

function Step({ n, done, title, hint, children }: { n: number; done: boolean; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="step">
      <span className={"step-no" + (done ? " done" : "")}>{done ? "✓" : n}</span>
      <div className="step-main">
        <div className="step-title"><b>{title}</b>{hint && <span>{hint}</span>}</div>
        {children}
      </div>
    </div>
  );
}

function Thumbs() {
  const frames = useStore((s) => s.frames);
  const first = frames.slice(0, 3);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    setUrls({}); // the cache is cleared when the folder changes, so old URLs are dead
    for (const f of first) void thumbnails.url(f.id, () => f.photo.file(), THUMB_EDGE).then((u) => { if (alive) setUrls((x) => ({ ...x, [f.id]: u })); }).catch(() => {});
    return () => { alive = false; };
  }, [frames]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span className="thumbs">{first.map((f) => <img key={f.id} src={urls[f.id]} alt="" />)}</span>;
}

function TeamCard({ side, onEdit }: { side: Side; onEdit: () => void }) {
  const st = useStore((s) => s[side]);
  const logoURLs = useStore((s) => s.logoURLs);
  const rosterMode = useStore((s) => s.rosterMode);
  const importing = useStore((s) => s.importing);
  if (!st.name) return <div className="teamcard empty" onClick={onEdit}>Name the {side} team</div>;
  const roster = importing === side ? "importing…" : rosterMode === "rosters" ? (st.team ? `${st.team.players.length} player${st.team.players.length === 1 ? "" : "s"}` : "no roster yet") : "no roster";
  return (
    <div className="teamcard" onClick={onEdit}>
      <Crest name={st.name} colour={st.colour} logoURL={st.team ? logoURLs[st.team.id] : null} size={40} />
      <span style={{ minWidth: 0 }}>
        <span className="tc-name">{st.name}</span>
        <span className="tc-meta"><span className="swatch" style={{ background: swatchColour(st.colour) }} />{st.colour || "no colour"} · {roster}</span>
      </span>
    </div>
  );
}

export { HurrdatFields };
