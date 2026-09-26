import { useRef, useState, type DragEvent } from "react";
import { useStore, derive } from "../store";
import { Button, Field, Overline, Segmented, Select, TextInput, Thumb, Spinner } from "../components";
import { TeamCard } from "./TeamCard";
import { Sports, Levels, type SportID } from "@core/sports/Sports";
import { TIERS, Cost, type Tier } from "@core/ai/Models";
import { supportsWritableFolders, HandleFolder } from "@platform/fs";
import { SupportedFormats } from "@core/images/SupportedFormats";

export function Setup() {
  const s = useStore();
  const usesRosters = derive.usesRosters(s);
  return (
    <div className="setup">
      <div className="setup-cols">
        <PhotosCard />
        <section className="card game-card" aria-label="The game">
          <Overline>The game</Overline>
          <div className="grid-3">
            <Field label="Level">
              <Select value={s.setup.levelId} onChange={(v) => s.setSetup({ levelId: v })} options={Levels.all.map((l) => ({ value: l.id, label: l.name }))} />
            </Field>
            <Field label="Sport">
              <Select<SportID> value={s.setup.sport} onChange={(v) => s.setSetup({ sport: v })} options={Sports.all.map((x) => ({ value: x.id, label: x.name }))} />
            </Field>
            {derive.sport(s).genders.length > 1 ? (
              <Field label="Gender">
                <Segmented value={s.setup.gender} onChange={(v) => s.setSetup({ gender: v })} options={[{ value: "womens", label: Levels.info(s.setup.levelId).kind === "highSchool" ? "Girls" : "Women" }, { value: "mens", label: Levels.info(s.setup.levelId).kind === "highSchool" ? "Boys" : "Men" }]} />
              </Field>
            ) : <div />}
          </div>

          {usesRosters ? (
            <>
              <div className="teams">
                <TeamCard slot="A" />
                <div className="teams-mid"><button type="button" className="icon-btn swap" title="Swap the teams" aria-label="Swap the teams" onClick={() => s.swapTeams()}>⇄</button></div>
                <TeamCard slot="B" />
              </div>
              {s.slots.A.team && s.slots.B.team && s.frames.length ? (
                <p className="muted small">Uniforms are read from a few of your photos before the run starts, so the two sides are told apart by what they wore today. {s.scouting ? <Spinner /> : <button type="button" className="link" onClick={() => s.scoutUniforms()}>Read them now</button>}</p>
              ) : null}
              <FaceStatus />
            </>
          ) : (
            <MeetFields />
          )}

          <Overline>Where</Overline>
          <div className="grid-3">
            <Field label="Venue"><TextInput placeholder="Memorial Stadium" value={s.setup.venue} onChange={(e) => s.setSetup({ venue: e.target.value })} /></Field>
            <Field label="City"><TextInput placeholder="Lincoln" value={s.setup.city} onChange={(e) => s.setSetup({ city: e.target.value })} /></Field>
            <Field label="State"><TextInput placeholder="Neb." value={s.setup.state} onChange={(e) => s.setSetup({ state: e.target.value })} /></Field>
          </div>
        </section>
      </div>
      <RunBar />
    </div>
  );
}

function MeetFields() {
  const s = useStore();
  return (
    <div className="meet">
      <Field label="Meet" wide hint="As a caption names it: “the Nebraska Class A state cross country championships”."><TextInput placeholder="Waverly Invitational" value={s.setup.eventName} onChange={(e) => s.setSetup({ eventName: e.target.value })} /></Field>
      <Field label="Entry list (optional)" wide hint={`One per line: bib, name, school. ${derive.entries(s).length ? `${derive.entries(s).length} entries read.` : "Without one, athletes are described by school lettering."}`}>
        <textarea className="input textarea" rows={5} placeholder={"1204, Jane Doe, Waverly\n1311, Ann Roe, Gretna"} value={s.setup.entriesText} onChange={(e) => s.setSetup({ entriesText: e.target.value })} />
      </Field>
    </div>
  );
}

function PhotosCard() {
  const s = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const writable = supportsWritableFolders();

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    // A dropped folder in Chromium comes with a handle that can be written to.
    const items = [...e.dataTransfer.items];
    const handle = items[0] && "getAsFileSystemHandle" in items[0] ? await (items[0] as DataTransferItem & { getAsFileSystemHandle(): Promise<FileSystemHandle | null> }).getAsFileSystemHandle() : null;
    if (handle?.kind === "directory") {
      const dir = handle as FileSystemDirectoryHandle;
      const perm = await dir.requestPermission({ mode: "readwrite" });
      if (perm === "granted") { await s.useFolder(new HandleFolder(dir)); return; }
    }
    const files = [...e.dataTransfer.files].filter((f) => SupportedFormats.isReadable(f.name));
    if (files.length) await s.useFiles(files);
  };

  if (!s.folder) {
    return (
      <section className="card photos-card" aria-label="Photographs">
        <Overline>Photographs</Overline>
        <div className={`drop${over ? " drop-over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
          {s.loadingFolder ? <Spinner /> : (
            <>
              <p className="drop-title">Drop a folder of photographs here</p>
              <p className="muted small">JPEG and camera RAW. Captions are written into the JPEGs; RAW files get an .xmp sidecar.</p>
              <div className="row center">
                {writable ? <Button kind="primary" onClick={() => s.chooseFolder()}>Choose folder</Button> : null}
                <Button kind={writable ? "secondary" : "primary"} onClick={() => input.current?.click()}>{writable ? "Open read-only" : "Choose folder"}</Button>
              </div>
              {!writable ? <p className="warn small">This browser can read the photographs but not write captions into them. Use Chrome, Edge or Brave to file captions.</p> : null}
            </>
          )}
          <input ref={input} type="file" hidden multiple {...{ webkitdirectory: "" }} onChange={(e) => s.useFiles([...(e.target.files ?? [])])} />
        </div>
        {s.recents.length ? (
          <div className="recents">
            <Overline>Recent shoots</Overline>
            {s.recents.map((r) => (
              <div key={r.id} className="recent">
                <button type="button" className="recent-open" onClick={() => s.openRecent(r)}>
                  <span className="recent-title">{r.title}</span>
                  <span className="meta">{r.folderName} · {r.photoCount} photos · {new Date(r.lastOpened).toLocaleDateString()}</span>
                </button>
                <button type="button" className="icon-btn" aria-label={`Forget ${r.folderName}`} onClick={() => s.forgetRecent(r.id)}>×</button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  const dated = s.frames.map((f) => f.exif?.captureDate).filter((d): d is Date => !!d);
  const first = dated.length ? new Date(Math.min(...dated.map((d) => d.getTime()))) : null;
  const counts = derive.counts(s);
  return (
    <section className="card photos-card" aria-label="Photographs">
      <Overline>Photographs</Overline>
      <div className="folder-head">
        <div>
          <div className="folder-name">{s.folder.name}</div>
          <div className="meta">{s.frames.length} photos{first ? ` · ${first.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}` : ""}{counts.done ? ` · ${counts.done} already read` : ""}{!s.folder.writable ? " · read-only" : ""}</div>
        </div>
        <Button small kind="ghost" onClick={() => s.closeShoot()}>Change</Button>
      </div>
      <div className="thumb-grid">
        {s.frames.slice(0, 24).map((f) => <Thumb key={f.id} frame={f} />)}
      </div>
      {s.frames.length > 24 ? <p className="muted small">and {s.frames.length - 24} more</p> : null}
    </section>
  );
}

function RunBar() {
  const s = useStore();
  const blocker = derive.blocker(s);
  const counts = derive.counts(s);
  const todo = s.frames.filter((f) => f.state !== "done").length;
  // Frames captioned by the first Cutline carry a caption but no reading to correct.
  const legacy = s.frames.filter((f) => f.state === "done" && !f.observation).map((f) => f.id);
  const tier = TIERS[s.settings.tier];
  return (
    <div className="runbar">
      <div className="runbar-tier">
        <Segmented<Tier> value={s.settings.tier} onChange={(v) => s.updateSettings({ tier: v })}
          options={(["economy", "balanced", "best"] as Tier[]).map((t) => ({ value: t, label: `${TIERS[t].name} · ${Cost.dollars(Cost.perPhoto(t) * 1000)}/1k`, title: TIERS[t].blurb }))} />
        <span className="muted small">{tier.blurb}</span>
      </div>
      <div className="runbar-go">
        {blocker ? <span className="muted small">{blocker}</span> : <span className="muted small">{todo ? `${todo} to read · about ${Cost.dollars(derive.estimate(s))}` : "Every photo has been read."}</span>}
        {counts.done ? <Button onClick={() => s.setScreen("review")}>Review</Button> : null}
        {legacy.length && !blocker ? <Button disabled={s.running} onClick={() => s.startRun({ ids: legacy })} title="These have captions from the first Cutline, without players to correct. Reading them again costs about the same as new photos.">Re-read {legacy.length} from the first Cutline · {Cost.dollars(legacy.length * Cost.perPhoto(s.settings.tier))}</Button> : null}
        <Button kind="primary" disabled={!!blocker || s.running || (!todo)} onClick={() => s.startRun()}>{s.running ? "Reading…" : !s.frames.length ? "Caption photos" : todo === s.frames.length ? `Caption ${todo} photos` : `Caption ${todo} more`}</Button>
      </div>
    </div>
  );
}

function FaceStatus() {
  const s = useStore();
  if (!s.settings.faces) return null;
  if (Levels.info(s.setup.levelId).kind !== "college") return <p className="muted small">Face matching is on, but it is used only for college rosters.</p>;
  if (!derive.facesOn(s)) return <p className="muted small">Face matching is on; neither roster has headshots to match against.</p>;
  const f = s.faces;
  return (
    <p className="muted small">
      Face matching (on this device only):{" "}
      {f.status === "ready" ? `${f.done} of ${f.total} roster photos ready.` : f.status === "preparing" ? <><Spinner /> reading roster photos {f.done}/{f.total}…</> : f.status === "unavailable" ? <span className="warn">{f.error}</span> : "prepared when the run starts."}
      {f.status === "off" || f.status === "unavailable" ? <>{" "}<button type="button" className="link" onClick={() => s.prepareFaces()}>Prepare now</button></> : null}
    </p>
  );
}
