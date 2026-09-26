import { useRef, useState, type DragEvent } from "react";
import { useStore, derive } from "../store";
import { Button, Field, Segmented, Select, TextInput, Thumb, Spinner } from "../components";
import { TeamCard } from "./TeamCard";
import { Sports, Levels, type SportID } from "@core/sports/Sports";
import { TIERS, Cost, type Tier } from "@core/ai/Models";
import { CAPTION_STYLES, Styles, type CaptionStyle } from "@core/caption/Styles";
import { supportsWritableFolders, HandleFolder } from "@platform/fs";
import { SupportedFormats } from "@core/images/SupportedFormats";

/**
 * Setting up a shoot: the photographs, the game and how it is filed on the left; the two teams
 * on the right; the reading and the button that starts it along the bottom.
 */
export function Setup() {
  const s = useStore();
  const usesRosters = derive.usesRosters(s);
  const kind = Levels.info(s.setup.levelId).kind;
  return (
    <div className="setup">
      <div className="setup-body">
        <div className="setup-col setup-left">
          <PhotosCard />
          <section className="card" aria-label="The game">
            <div className="card-head"><b>Game</b>{s.photoHeadline ? <span className="faint">Filled in from the headline</span> : null}</div>
            <div className="grid-3">
              <Field label="Level">
                <Select value={s.setup.levelId} onChange={(v) => s.setSetup({ levelId: v })} options={Levels.all.map((l) => ({ value: l.id, label: l.name }))} />
              </Field>
              <Field label="Sport">
                <Select<SportID> value={s.setup.sport} onChange={(v) => s.setSetup({ sport: v })} options={Sports.all.map((x) => ({ value: x.id, label: x.name }))} />
              </Field>
              {derive.sport(s).genders.length > 1 ? (
                <Field label="Gender">
                  <Segmented block value={s.setup.gender} onChange={(v) => s.setSetup({ gender: v })} options={[{ value: "womens", label: kind === "highSchool" ? "Girls" : "Women" }, { value: "mens", label: kind === "highSchool" ? "Boys" : "Men" }]} />
                </Field>
              ) : <div />}
            </div>
            <Field label="Venue"><TextInput placeholder="Memorial Stadium" value={s.setup.venue} onChange={(e) => s.setSetup({ venue: e.target.value })} /></Field>
            <div className="grid-city">
              <Field label="City"><TextInput placeholder="Lincoln" value={s.setup.city} onChange={(e) => s.setSetup({ city: e.target.value })} /></Field>
              <Field label="State"><TextInput placeholder="Neb." value={s.setup.state} onChange={(e) => s.setSetup({ state: e.target.value })} /></Field>
            </div>
          </section>
          <section className="card" aria-label="Filed for">
            <div className="card-head"><b>Filed for</b><span className="faint">{s.setup.style || s.setup.house !== null ? "This shoot only" : "Your defaults"}</span></div>
            <div className="grid-3">
              <Field label="Style">
                <Select<CaptionStyle> value={derive.style(s)} onChange={(v) => s.setSetup({ style: v })} options={CAPTION_STYLES.map((v) => ({ value: v, label: Styles.displayName(v) }))} />
              </Field>
              <Field label="Credit">
                <TextInput placeholder={Styles.defaultHouse(derive.style(s)) ?? ""} value={derive.house(s)} onChange={(e) => s.setSetup({ house: e.target.value })} />
              </Field>
              <Field label="Byline"><TextInput value={s.settings.photographer} onChange={(e) => s.updateSettings({ photographer: e.target.value })} /></Field>
            </div>
          </section>
        </div>

        <div className="setup-col">
          {usesRosters ? (
            <>
              <div className="teams-head">
                <span className="overline">Teams</span>
                <button type="button" className="link" onClick={() => s.swapTeams()} title="Swap which team is yours">Swap sides</button>
              </div>
              <div className="teams">
                <TeamCard slot="A" />
                <TeamCard slot="B" />
              </div>
              {s.slots.A.team && s.slots.B.team && s.frames.length && (!s.slots.A.team.uniform || !s.slots.B.team.uniform) ? (
                <p className="faint small">What each team is wearing is read from a few of your photos when the run starts. {s.scouting ? <Spinner /> : <button type="button" className="link" onClick={() => s.scoutUniforms()}>Read it now</button>}</p>
              ) : null}
              <FaceStatus />
            </>
          ) : (
            <section className="card" aria-label="The meet">
              <div className="card-head"><b>The meet</b><span className="faint">No rosters — athletes are named from the entry list</span></div>
              <MeetFields />
            </section>
          )}
        </div>
      </div>
      <RunBar />
    </div>
  );
}

function MeetFields() {
  const s = useStore();
  return (
    <>
      <Field label="Meet" hint="As a caption names it: “the Nebraska Class A state cross country championships”."><TextInput placeholder="Waverly Invitational" value={s.setup.eventName} onChange={(e) => s.setSetup({ eventName: e.target.value })} /></Field>
      <Field label="Entry list (optional)" hint={`One per line: bib, name, school. ${derive.entries(s).length ? `${derive.entries(s).length} entries read.` : "Without one, athletes are described by school lettering."}`}>
        <textarea className="input textarea" rows={8} placeholder={"1204, Jane Doe, Waverly\n1311, Ann Roe, Gretna"} value={s.setup.entriesText} onChange={(e) => s.setSetup({ entriesText: e.target.value })} />
      </Field>
    </>
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
        <div className="card-head"><b>Photographs</b></div>
        <div className={`drop${over ? " drop-over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
          {s.loadingFolder ? <Spinner /> : (
            <>
              <p className="drop-title">Drop a folder of photographs here</p>
              <p className="faint small">JPEG and camera RAW. Captions are written into the JPEGs; RAW files get an .xmp sidecar.</p>
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
            <div className="overline">Recent shoots</div>
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

  const counts = derive.counts(s);
  const camera = s.frames.find((f) => f.exif?.cameraModel)?.exif?.cameraModel;
  const kinds = [...new Set(s.frames.map((f) => (SupportedFormats.isRaw(f.name) ? "RAW" : "JPEG")))].join(" + ");
  return (
    <section className="card photos-card" aria-label="Photographs">
      <div className="card-head"><b>Photographs</b><button type="button" className="link" onClick={() => s.closeShoot()}>Change</button></div>
      <div className="folder">
        <b>{s.folder.name}</b>
        <span>{s.frames.length} photos · {kinds}{camera ? ` · ${camera}` : ""}{counts.done ? ` · ${counts.done} already read` : ""} · {s.folder.writable ? "captions are written into the files" : "read-only"}</span>
      </div>
      <div className="sthumbs">{s.frames.slice(0, 6).map((f) => <Thumb key={f.id} frame={f} />)}</div>
      {s.photoHeadline ? (
        <div className="found"><span className="found-mark">✓</span><div><b>Headline found in the photos</b><span>{s.photoHeadline}</span></div></div>
      ) : null}
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
    <footer className="runbar">
      <Segmented<Tier> value={s.settings.tier} onChange={(v) => s.updateSettings({ tier: v })}
        options={(["economy", "balanced", "best"] as Tier[]).map((t) => ({ value: t, label: <>{TIERS[t].name}<em>{Cost.perThousand(t)}</em></>, title: TIERS[t].blurb }))} />
      <span className="runbar-note">per 1,000 photos. {tier.blurb}</span>
      <span className="spacer" />
      <span className="runbar-est">{blocker ?? (todo ? `${todo} photo${todo === 1 ? "" : "s"} · about ${Cost.dollars(derive.estimate(s))}` : s.frames.length ? "Every photo has been read" : "")}</span>
      {counts.done ? <Button onClick={() => s.setScreen("review")}>Review</Button> : null}
      {legacy.length && !blocker ? <Button disabled={s.running} onClick={() => s.startRun({ ids: legacy })} title="These have captions from the first Cutline, without players to correct. Reading them again costs about the same as new photos.">Re-read {legacy.length} from the first Cutline</Button> : null}
      <Button kind="primary" large disabled={!!blocker || s.running || (!todo)} onClick={() => s.startRun()}>{s.running ? "Reading…" : !s.frames.length ? "Caption photos" : !todo ? "All read" : todo === s.frames.length ? `Caption ${todo} photos` : `Caption ${todo} more`}</Button>
    </footer>
  );
}

function FaceStatus() {
  const s = useStore();
  const college = Levels.info(s.setup.levelId).kind === "college";
  if (!college) return null;
  const f = s.faces;
  let state: string, action = null as React.ReactNode;
  if (!s.settings.faces) { state = "off"; action = <button type="button" className="link" onClick={async () => { await s.updateSettings({ faces: true }); void useStore.getState().prepareFaces(); }}>Turn on</button>; }
  else if (!derive.facesOn(s)) state = "on · neither roster has headshots";
  else if (f.status === "ready") state = `on · ${f.done} of ${f.total} roster photos ready`;
  else if (f.status === "preparing") state = `on · reading roster photos ${f.done}/${f.total}`;
  else if (f.status === "unavailable") state = `unavailable · ${f.error}`;
  else { state = "on · prepared when the run starts"; action = <button type="button" className="link" onClick={() => s.prepareFaces()}>Prepare now</button>; }
  return (
    <div className="faces">
      <span><b>Face matching</b> · {state}{f.status === "preparing" ? <> <Spinner /></> : null}</span>
      <span className="faint">Names a player whose number is hidden, from college roster headshots. Runs on this computer only.</span>
      <span className="spacer" />
      {action}
    </div>
  );
}
