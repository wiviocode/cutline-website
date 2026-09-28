import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore, derive, thumbnails, previews, type Frame } from "../store";
import { Button, Headshot, Segmented, Spinner, Switch } from "../components";
import { PlayerPicker } from "./PlayerPicker";
import { RenameDialog } from "./Rename";
import { Compose } from "@core/caption/Compose";
import { Styles } from "@core/caption/Styles";
import { Cost } from "@core/ai/Models";
import { Matchup, Player } from "@core/roster/Roster";
import { PhotoMetadata } from "@core/images/PhotoMetadata";
import { decodableBlob } from "@platform/images";
import { Identify, type Identity } from "@core/vision/Identify";
import { FACE_SUGGEST, likeness } from "@core/vision/FaceEvidence";

import type { Subject } from "@core/vision/Observation";

/**
 * The review screen: the photograph on the stage, the caption and who is in it beside it, and the
 * filmstrip along the bottom. Arrows move, Return approves, space zooms; the photograph always
 * fits its box, whatever the window.
 */
export function Review() {
  const s = useStore();
  const visible = derive.visible(s);
  const selected = s.frames.find((f) => f.id === s.selectedID) ?? visible[0] ?? null;
  const [picking, setPicking] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [zoomKey, setZoomKey] = useState(0);
  const counts = derive.counts(s);
  useEffect(() => { setPicking(null); }, [selected?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT" || t.isContentEditable;
      if (picking || renaming || useStore.getState().panel) return;
      if (typing) { if (e.key === "Escape") t.blur(); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); s.step(1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); s.step(-1); }
      else if (e.key === "Enter") { e.preventDefault(); void s.approveAndNext(); }
      else if (e.key === " ") { e.preventDefault(); setZoomKey((k) => k + 1); }
      else if (/^[1-9]$/.test(e.key) && selected?.observation?.subjects[Number(e.key) - 1]) { e.preventDefault(); setPicking(selected.observation.subjects[Number(e.key) - 1].id); }
      else if (e.key === "e") { e.preventDefault(); document.getElementById("caption-view")?.click(); document.getElementById("caption-edit")?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s, selected, picking, renaming]);

  const count = (n: number) => <em>{n}</em>;
  return (
    <div className="review">
      <div className="review-bar">
        <Segmented value={s.filter} onChange={(f) => s.setFilter(f)} options={[
          { value: "all", label: <>All{count(counts.total)}</> },
          { value: "review", label: <>To check{count(counts.review + counts.failed)}</> },
          { value: "unapproved", label: <>Not approved{count(counts.total - counts.approved)}</> },
          { value: "approved", label: <>Approved{count(counts.approved)}</> },
        ]} />
        <div className="review-bar-right">
          {selected && visible.length ? <span className="position">{visible.findIndex((f) => f.id === selected.id) + 1} of {visible.length}</span> : null}
          {s.running ? (
            <>
              <div className="progress" aria-label={`Read ${s.runDone} of ${s.runTotal}`}><div className="progress-fill" style={{ width: `${(100 * s.runDone) / Math.max(1, s.runTotal)}%` }} /></div>
              <span className="position">{s.runDone}/{s.runTotal} · {Cost.dollars(s.spent)}</span>
              <Button onClick={() => s.cancelRun()} disabled={s.cancelRequested}>{s.cancelRequested ? "Stopping…" : "Stop"}</Button>
            </>
          ) : (
            <>
              {counts.pending + counts.failed ? <Button onClick={() => s.startRun()}>Read {counts.pending + counts.failed} remaining</Button> : null}
              {s.folder?.writable && derive.usesRosters(s) ? <Button kind="ghost" onClick={() => setRenaming(true)}>Rename…</Button> : null}
              {s.frames.some((f) => f.approved && !f.written) && s.folder?.writable ? <Button onClick={() => s.writeAllApproved()}>Write {s.frames.filter((f) => f.approved && !f.written).length} approved</Button> : null}
              {s.folder && !s.folder.writable && s.frames.some((f) => f.approved) ? <Button onClick={() => s.downloadSidecars()} title="This browser cannot write into the photographs; take the captions as .xmp sidecars instead">Download captions (.xmp)</Button> : null}
            </>
          )}
        </div>
      </div>

      <div className="review-main">
        {selected ? <Stage key={selected.id} frame={selected} onPick={setPicking} zoomKey={zoomKey} /> : <div className="stage stage-none"><p className="muted">Nothing here with this filter.</p></div>}
        <div className="inspector-wrap">
          {selected ? <Inspector key={selected.id} frame={selected} onPick={setPicking} /> : <aside className="inspector" />}
          {picking && selected?.observation ? <PlayerPicker frame={selected} subjectID={picking} onClose={() => setPicking(null)} /> : null}
        </div>
      </div>

      <Filmstrip frames={visible} selectedID={selected?.id ?? null} />
      {renaming ? <RenameDialog onClose={() => setRenaming(false)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- filmstrip

/** Where a frame stands, as the colour of the bar under its thumbnail. */
function frameStatus(f: Frame): { color: string; label: string } {
  if (f.approved) return { color: "var(--ok)", label: "Approved" };
  if (f.state === "failed") return { color: "var(--unnamed)", label: "Failed" };
  if (f.state === "working") return { color: "var(--gold)", label: "Reading" };
  if (f.state === "done" && Identify.needsReview(f.identities)) return { color: "var(--check)", label: "To check" };
  if (f.state === "done") return { color: "var(--read)", label: "Read" };
  return { color: "transparent", label: "Not read" };
}

function Filmstrip({ frames, selectedID }: { frames: Frame[]; selectedID: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector(`[data-id="${CSS.escape(selectedID ?? "")}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [selectedID]);
  const all = useStore((s) => s.frames);
  return (
    <div className="filmstrip" ref={ref} role="listbox" aria-label="Photographs">
      {frames.map((f) => <FilmThumb key={f.id} frame={f} on={f.id === selectedID} n={all.indexOf(f) + 1} />)}
    </div>
  );
}

const FilmThumb = memo(function FilmThumb({ frame, on, n }: { frame: Frame; on: boolean; n: number }) {
  const [url, setURL] = useState<string | null>(() => thumbnails.cached(frame.id));
  const el = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (url) return;
    const node = el.current;
    if (!node) return;
    let live = true;
    // A thumbnail is asked for only as it nears the strip's view.
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); void thumbnails.url(frame.id, frame.photo).then((u) => { if (live) setURL(u); }).catch(() => {}); }
    }, { root: node.parentElement, rootMargin: "0px 600px" });
    io.observe(node);
    return () => { live = false; io.disconnect(); };
  }, [frame.id, frame.photo, url]);
  const st = frameStatus(frame);
  return (
    <button ref={el} type="button" data-id={frame.id} role="option" aria-selected={on} title={`${frame.name} · ${st.label}`}
      className={`film${on ? " film-on" : ""}${frame.state === "pending" ? " film-pending" : ""}${frame.state === "working" ? " film-working" : ""}`}
      style={{ "--sc": st.color } as React.CSSProperties}
      onClick={(e) => { e.currentTarget.blur(); useStore.getState().select(frame.id); }}>
      {url ? <img src={url} alt="" draggable={false} /> : <span className="thumb-wait" />}
      <span className="film-num">{String(n).padStart(2, "0")}</span>
    </button>
  );
});

// ---------------------------------------------------------------- stage

/** What a box's label says, for measuring it: "3 Adriano", "21 Taylor?", "2_ ?". */
function boxLabelText(x: Subject, id: Identity | undefined): string {
  const p = id?.player;
  if (p) return `${p.role === "staff" ? "" : `${p.number} `}${p.lastName}${id?.status === "likely" ? "?" : ""}`;
  return x.number ? `${x.number} ?` : x.kind === "athlete" ? "?" : x.role || x.kind;
}

function statusClass(id: Identity | undefined, s: Subject): string {
  if (s.kind !== "athlete" && !id?.player) return "box-other";
  return !id ? "box-unknown" : id.status === "confirmed" ? "box-confirmed" : id.status === "likely" ? "box-likely" : "box-unknown";
}

const CLICK_ZOOM = 2.5;
const decodable = /\.(jpe?g|png|webp)$/i;

/**
 * The photograph, fitted to the stage. A click zooms in on that point and a click that did not
 * move zooms back out; zoomed in, it drags, and the wheel zooms further, up to the photograph's
 * own pixels. Zooming loads the original file itself, so detail is the camera's, not the preview's.
 */
function Stage({ frame, onPick, zoomKey }: { frame: Frame; onPick: (id: string) => void; zoomKey: number }) {
  const area = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(() => previews.cached(frame.id) ?? thumbnails.cached(frame.id));
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const viewRef = useRef(view); viewRef.current = view;
  const [full, setFull] = useState<{ url: string | null; state: "none" | "loading" | "ready" | "failed" }>({ url: null, state: "none" });
  const showBoxes = useStore((st) => st.showBoxes);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  // The preview, then nothing else until a zoom asks for the original.
  useEffect(() => {
    let live = true;
    void previews.url(frame.id, frame.photo).then((u) => { if (live) setSrc(u); }).catch(() => {});
    return () => { live = false; };
  }, [frame.id, frame.photo]);
  useEffect(() => () => { if (full.url) URL.revokeObjectURL(full.url); }, [full.url]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Where the photograph sits in the stage when it is fitted.
  const fit = useMemo(() => {
    if (!box || !natural) return null;
    const scale = Math.min(box.w / natural.w, box.h / natural.h);
    const w = natural.w * scale, h = natural.h * scale;
    return { w, h, x: (box.w - w) / 2, y: (box.h - h) / 2 };
  }, [box, natural]);
  const [fullSize, setFullSize] = useState<{ w: number; h: number } | null>(null);
  // The original's width, from the reading or, for a frame restored without one, from the file once decoded.
  const originalWidth = frame.original?.width ?? fullSize?.w ?? null;
  const maxZoom = fit ? Math.max(CLICK_ZOOM * 1.6, originalWidth ? originalWidth / fit.w : 6) : CLICK_ZOOM;

  const clamp = useCallback((z: number, x: number, y: number) => {
    if (!fit) return { z: 1, x: 0, y: 0 };
    const zz = Math.max(1, Math.min(maxZoom, z));
    return { z: zz, x: Math.min(0, Math.max(fit.w * (1 - zz), x)), y: Math.min(0, Math.max(fit.h * (1 - zz), y)) };
  }, [fit, maxZoom]);

  /** Zoom to `z` keeping the point (px, py) — in fitted-photo coordinates — where it is. */
  const zoomAbout = useCallback((z: number, px: number, py: number) => {
    setView((v) => {
      const zz = Math.max(1, Math.min(maxZoom, z));
      return clamp(zz, px - (px - v.x) * (zz / v.z), py - (py - v.y) * (zz / v.z));
    });
  }, [clamp, maxZoom]);

  const zoomed = view.z > 1.001;
  // The original is decoded once, the first time this frame is zoomed; the stage is keyed on the
  // frame, so a new frame starts over.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const started = useRef(false);
  useEffect(() => {
    if (!zoomed || started.current) return;
    started.current = true;
    setFull({ url: null, state: "loading" });
    void (async () => {
      try {
        const file = await frame.photo.file();
        const blob = decodable.test(frame.name) ? file : await decodableBlob(file, 100_000);
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        await img.decode();
        if (!alive.current) { URL.revokeObjectURL(url); return; }
        setFullSize({ w: img.naturalWidth, h: img.naturalHeight });
        setFull({ url, state: "ready" });
      } catch { if (alive.current) setFull({ url: null, state: "failed" }); }
    })();
  }, [zoomed, frame.photo, frame.name]);

  // Space, from the screen's keys.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!fit) return;
    if (viewRef.current.z > 1.001) setView({ z: 1, x: 0, y: 0 }); else zoomAbout(CLICK_ZOOM, fit.w / 2, fit.h / 2);
  }, [zoomKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const local = (e: { clientX: number; clientY: number }) => {
    const r = area.current!.getBoundingClientRect();
    return { px: e.clientX - r.left - (fit?.x ?? 0), py: e.clientY - r.top - (fit?.y ?? 0) };
  };
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !fit) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      if (viewRef.current.z <= 1.001) return;
      setDragging(true);
      setView((v) => clamp(v.z, d.vx + dx, d.vy + dy));
    };
    const up = (e: MouseEvent) => {
      const d = drag.current;
      drag.current = null;
      setDragging(false);
      if (!d || d.moved) return;
      if (viewRef.current.z > 1.001) setView({ z: 1, x: 0, y: 0 });
      else { const { px, py } = local(e); zoomAbout(CLICK_ZOOM, px, py); }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [clamp, zoomAbout, fit]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!fit) return;
      e.preventDefault();
      const { px, py } = local(e);
      zoomAbout(viewRef.current.z * Math.exp(-e.deltaY * 0.0022), px, py);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [fit, zoomAbout]); // eslint-disable-line react-hooks/exhaustive-deps

  const obs = frame.observation;
  const actual = fit && originalWidth ? Math.round((100 * view.z * fit.w) / originalWidth) : null;
  // Labels go above their box, unless that runs off the photograph or into a neighbour's label.
  const under = useMemo(() => {
    const out = new Set<string>();
    if (!obs || !frame.sent || !fit) return out;
    const k = fit.w / frame.sent.width;
    const placed: number[][] = [];
    const hit = (r: number[]) => placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
    for (const x of obs.subjects.filter((x) => x.box).sort((a, b) => a.box![0] - b.box![0])) {
      const [x1, y1, , y2] = x.box!.map((v) => v * k);
      const w = boxLabelText(x, frame.identities.find((i) => i.subjectId === x.id)).length * 6.8 + 26, h = 21;
      const above = [x1, y1 - h - 4, x1 + w, y1 - 4], below = [x1, y2 + 4, x1 + w, y2 + h + 4];
      if (above[1] < 0 || hit(above)) { out.add(x.id); placed.push(below); } else placed.push(above);
    }
    return out;
  }, [obs, frame.sent, frame.identities, fit]);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const atFull = actual !== null && Math.abs(actual - 100) < 2;
  const exposure = PhotoMetadata.exposure(frame.exif);

  return (
    <div className="stage">
      <div ref={area} className={`stage-area${zoomed ? " zoomed" : ""}${dragging ? " dragging" : ""}`} onMouseDown={onMouseDown}>
        {src ? (
          <div className="stage-canvas" style={fit ? { left: fit.x, top: fit.y, width: fit.w, height: fit.h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transition: dragging ? "none" : undefined } : { visibility: "hidden" }}>
            <img src={src} alt={frame.name} draggable={false} onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth) setNatural({ w: i.naturalWidth, h: i.naturalHeight }); }} />
            {full.state === "ready" && full.url ? <img className="stage-full" src={full.url} alt="" draggable={false} /> : null}
            {showBoxes && !zoomed && obs && frame.sent ? (
              <div className="boxes">
                {obs.subjects.filter((x) => x.box).map((x) => {
                  const [x1, y1, x2, y2] = x.box!;
                  const sx = 100 / frame.sent!.width, sy = 100 / frame.sent!.height;
                  const id = frame.identities.find((k) => k.subjectId === x.id);
                  const p = id?.player;
                  return (
                    <button key={x.id} type="button" className={`box ${statusClass(id, x)}`} onMouseDown={stop} onMouseUp={stop} onClick={() => onPick(x.id)} title="Change who this is"
                      style={{ left: `${x1 * sx}%`, top: `${y1 * sy}%`, width: `${Math.max(0.5, (x2 - x1) * sx)}%`, height: `${Math.max(0.5, (y2 - y1) * sy)}%` }}>
                      <span className={`box-label${under.has(x.id) ? " box-label-under" : ""}`}>
                        {p ? <>{p.role === "staff" ? null : <i>{p.number}</i>}{p.lastName}{id?.status === "likely" ? "?" : ""}</>
                          : x.number ? <><i>{x.number.replace(/\?/g, "_")}</i>?</> : x.kind === "athlete" ? "?" : cap(x.role || x.kind)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : <div className="stage-empty"><Spinner /></div>}
        {frame.state === "working" ? <div className="stage-badge"><Spinner /> Reading…</div> : null}
        {zoomed ? <div className="stage-badge stage-badge-right">{full.state === "loading" ? <><Spinner /> Full resolution…</> : full.state === "ready" ? "Full resolution" : full.state === "failed" ? "Preview only" : null}</div> : null}
      </div>
      <div className="stage-foot">
        <span className="mono">{frame.name}</span>
        {frame.exif?.captureDate ? <span>{frame.exif.captureDate.toLocaleTimeString()}</span> : null}
        {exposure ? <span className="mono faint">{exposure}</span> : null}
        <span className="spacer" />
        {zoomed && actual ? <span className="mono faint">{actual}%</span> : null}
        <Segmented small value={!zoomed ? "fit" : atFull ? "full" : "other"} onChange={(v) => { if (v === "fit") setView({ z: 1, x: 0, y: 0 }); else if (fit && originalWidth) zoomAbout(originalWidth / fit.w, fit.w / 2, fit.h / 2); }}
          options={[{ value: "fit", label: "Fit" }, { value: "full", label: "100%", title: "The photograph's own pixels" }]} />
        {obs ? <Switch on={showBoxes} onChange={(v) => useStore.setState({ showBoxes: v })}>Boxes</Switch> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- inspector

/** The caption as it reads, names underlined by how sure they are; a click edits it. */
function CaptionText({ text, marks }: { text: string; marks: { name: string; sure: boolean }[] }) {
  const usable = marks.filter((m) => m.name.trim());
  if (!usable.length) return <>{text}</>;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${usable.map((m) => `${esc(m.name)}(?: \\(\\d+\\)| #\\d+)?`).sort((a, b) => b.length - a.length).join("|")})`, "g");
  const out: ReactNode[] = [];
  text.split(re).forEach((piece, i) => {
    if (i % 2 === 1) {
      const m = usable.find((x) => piece.startsWith(x.name));
      out.push(<span key={i} className={`nm${m && !m.sure ? " nm-check" : ""}`}>{piece}</span>);
    } else if (piece) out.push(piece);
  });
  return <>{out}</>;
}

function Inspector({ frame, onPick }: { frame: Frame; onPick: (id: string) => void }) {
  const s = useStore();
  const [draft, setDraft] = useState(frame.caption);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(frame.note);
  useEffect(() => { setDraft(frame.caption); }, [frame.caption]);
  useEffect(() => { setNote(frame.note); }, [frame.note]);
  const ctx = useMemo(() => derive.captionContext(s, frame), [s, frame]);
  const matchup = derive.matchup(s);
  const obs = frame.observation;
  const inClause = new Set((obs?.clause.match(/\{P\d+\}/g) ?? []).map((t) => t.slice(1, -1)));
  const previous = derive.previousCaptioned(s, frame.id);
  const marks = frame.identities.filter((i) => i.player).map((i) => ({ name: Player.fullName(i.player!), sure: i.status === "confirmed" }));
  // A look at the faces is offered for college rosters with headshots, when someone is not yet sure.
  const faceable = !!obs && derive.facesAvailable(s) && obs.subjects.some((x) => x.kind === "athlete" && x.box && frame.identities.find((i) => i.subjectId === x.id)?.status !== "confirmed");

  const commit = () => { setEditing(false); if (draft !== frame.caption) void s.editCaption(frame.id, draft); };
  const writeState = frame.approved
    ? (frame.written ? (s.folder?.writable ? "Written to the file" : "Approved") : frame.writeError ? `Not written: ${frame.writeError}` : s.folder?.writable ? "Writing…" : "Approved · read-only folder")
    : s.folder?.writable ? (s.settings.writeTo === "both" ? "Writes to JPEG + .xmp" : s.settings.writeTo === "sidecar" ? "Writes an .xmp sidecar" : "Writes into the JPEG") : "Read-only folder";

  return (
    <aside className="inspector" aria-label="Caption">
      <div className="insp-body">
        <section className="insp-section">
          <div className="insp-head">
            <span className="overline">Caption</span>
            <span className="insp-head-actions">
              {frame.copyUndo ? <button type="button" className="link" onClick={() => void s.undoCopy(frame.id)}>Copied · undo</button>
                : previous ? (
                  <button type="button" className="link" disabled={frame.state === "working" || previous.caption === frame.caption}
                    title={`Use the caption from ${previous.name}${frame.state === "pending" ? " — this photograph is then not sent to be read" : ""}`}
                    onClick={() => void s.copyPreviousCaption(frame.id)}>Copy previous</button>
                ) : null}
            </span>
          </div>
          {frame.state === "failed" ? <p className="error small">{frame.error}</p> : null}
          {editing || !frame.caption ? (
            <textarea id="caption-edit" className="input textarea caption-edit" rows={7} value={draft} autoFocus={editing}
              onChange={(e) => setDraft(e.target.value)} onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } if (e.key === "Escape") { setDraft(frame.caption); setEditing(false); } }}
              placeholder={frame.state === "pending" ? "Not read yet. Read it, copy the previous caption, or write one here." : frame.state === "working" ? "Reading…" : ""} />
          ) : (
            <div id="caption-view" className="caption-view" role="button" tabIndex={0} title="Click to edit" onClick={() => setEditing(true)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); setEditing(true); } }}>
              <CaptionText text={frame.caption} marks={marks} />
            </div>
          )}
          <div className="caption-meta">
            <span>{Styles.displayName(ctx.style)} style</span>
            {frame.captionEdited && obs && !frame.copyUndo ? <span>Edited by hand · <button type="button" className="link" onClick={() => s.revertCaption(frame.id)}>Undo</button></span> : null}
          </div>
        </section>

        {obs ? (
          <section className="insp-section">
            <div className="insp-head">
              <span className="overline">In the photo</span>
              <span className="insp-head-actions">
                {faceable ? (
                  <button type="button" className="link" disabled={!!s.faceBusy || frame.state === "working"} onClick={() => void s.faceLook(frame.id)}
                    title="Compare the faces of anyone not yet named with the roster headshots — on this computer, at no cost">
                    {s.faceBusy === frame.id ? <><Spinner /> Matching faces…</> : "Match faces"}
                  </button>
                ) : null}
                <span className="faint">{obs.subjects.length === 1 ? "1 person" : `${obs.subjects.length} people`}</span>
              </span>
            </div>
            {obs.subjects.length === 0 ? <p className="muted small">No one named — {obs.scene === "wide" ? "a wide view" : obs.scene === "crowd" ? "the crowd" : "a group scene"}.</p> : null}
            <div className="who">
              {obs.subjects.map((x) => {
                const id = frame.identities.find((k) => k.subjectId === x.id);
                const p = id?.player ?? null;
                const team = id?.teamKey && matchup ? Matchup.team(matchup, id.teamKey) : null;
                const st = subjectStatus(id, x);
                const role = p ? (p.role === "staff" ? cap(p.position || "coach") : cap(Player.positionFor(p, id?.side ?? null) || p.positionAbbr)) : "";
                const meta = [p?.number ? `#${p.number}` : !p && x.number ? `#${x.number.replace(/\?/g, "_")}` : "", role, team?.school ?? (x.kind === "athlete" ? "team not known" : "")].filter(Boolean).join(" · ");
                const open = id && id.status !== "confirmed" && x.kind === "athlete";
                const alts = open ? id.alternatives.filter((a) => a.id !== p?.id).slice(0, p ? 2 : 3) : [];
                // Someone the roster photos resemble, offered for a click when no one is named.
                const byFace = open && !p && matchup ? (frame.faceHints[x.id] ?? []).filter((h) => h.score >= FACE_SUGGEST)
                  .map((h) => ({ h, who: (["A", "B"] as const).map((k) => ({ k, pl: Matchup.team(matchup, k).players.find((q) => q.id === h.playerID) })).find((w) => w.pl) }))
                  .filter((c) => c.who && !alts.some((a) => a.id === c.h.playerID)).slice(0, 2) : [];
                return (
                  <div key={x.id} className={`who-row who-${st.cls}${inClause.has(x.id) ? "" : " who-unused"}`}>
                    <button type="button" className="who-main" onClick={() => onPick(x.id)} title="Change who this is">
                      <Headshot url={p?.headshotURL} fallback={p?.number || x.number.replace(/\?/g, "") || "?"} />
                      <span className="who-text">
                        <b>{p ? Player.fullName(p) : x.kind === "athlete" ? (x.number ? "Not named yet" : "No number seen") : cap(x.role || x.kind)}</b>
                        <small>{meta}{inClause.has(x.id) ? "" : " · not in the caption"}</small>
                      </span>
                      <span className={`status status-${st.cls}`}>{st.word}</span>
                    </button>
                    {open && id.reason ? <div className="who-why">{id.reason}</div> : null}
                    {open ? (
                      <div className="alts">
                        {p && id.teamKey ? <button type="button" className="chip chip-on" onClick={() => s.setManual(frame.id, x.id, { teamKey: id.teamKey, playerID: p.id })}>✓ {p.lastName}</button> : null}
                        {alts.map((a) => <button key={a.id} type="button" className="chip" onClick={() => s.setManual(frame.id, x.id, { teamKey: id.teamKey, playerID: a.id })}><span className="mono">{a.number}</span>{a.lastName}</button>)}
                        {byFace.map(({ h, who }) => (
                          <button key={h.playerID} type="button" className="chip chip-face" title={`The face resembles ${Player.fullName(who!.pl!)}'s roster photo (${likeness(h.score)}), on this computer`}
                            onClick={() => s.setManual(frame.id, x.id, { teamKey: who!.k, playerID: h.playerID })}>
                            <Headshot url={who!.pl!.headshotURL} size="sm" /><span className="mono">{who!.pl!.number}</span>{who!.pl!.lastName}?
                          </button>
                        ))}
                        <button type="button" className="chip" onClick={() => onPick(x.id)}>{p || alts.length || byFace.length ? "Someone else…" : "Choose a player…"}</button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="insp-section">
          <div className="insp-head"><span className="overline">Note for another look</span></div>
          <div className="note-row">
            <input className="input" placeholder="e.g. #24 is the ball carrier" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => s.setNote(frame.id, note)}
              onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) { s.setNote(frame.id, note); void s.reread(frame.id); } }} />
            <Button disabled={frame.state === "working" || s.running} onClick={() => { s.setNote(frame.id, note); void s.reread(frame.id); }}>{frame.state === "pending" ? "Read" : "Read again"}</Button>
          </div>
        </section>
      </div>

      <div className="insp-foot">
        {frame.approved
          ? <Button large block onClick={() => s.setApproved(frame.id, false)}>Unapprove</Button>
          : <Button kind="primary" large block disabled={!frame.caption} onClick={() => s.approveAndNext()}>Approve</Button>}
        <div className="insp-meta">
          <span>{frame.model ? `${modelName(frame.model)} ·${Cost.dollars(frame.dollars)}${frame.zooms.length ? ` · ${frame.zooms.length} close look${frame.zooms.length > 1 ? "s" : ""}` : ""}` : frame.state === "done" ? (frame.captionEdited && !frame.observation ? "Written by hand" : "Caption from an earlier session") : ""}</span>

          <span className={frame.writeError ? "error" : ""}>{writeState}</span>
        </div>
      </div>
    </aside>
  );
}

function subjectStatus(id: Identity | undefined, x: Subject): { cls: "ok" | "check" | "unnamed" | "other"; word: string } {
  if (id?.player?.role === "staff") return { cls: "ok", word: "Coach" };
  if (x.kind !== "athlete") return { cls: "other", word: cap(x.kind) };
  if (id?.player && id.status === "confirmed") return { cls: "ok", word: id.source === "manual" || id.source === "note" ? "Set" : "Sure" };

  if (id?.player) return { cls: "check", word: "Check" };
  return { cls: "unnamed", word: "Unnamed" };
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "claude-opus-5-5" → "Opus 5.5", "claude-sonnet-5" → "Sonnet 5". */
const modelName = (m: string) => cap(m.replace(/^claude-/, "").replace(/-(\d+)(?:-(\d+))?(?:-\d{8})?$/, (_, a: string, b?: string) => ` ${a}${b ? `.${b}` : ""}`));
