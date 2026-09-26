import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore, derive, thumbnails, previews, type Frame } from "../store";
import { Button, Segmented, StatusDot, Spinner } from "../components";
import { PlayerPicker } from "./PlayerPicker";
import { RenameDialog } from "./Rename";
import { Compose } from "@core/caption/Compose";
import { Cost } from "@core/ai/Models";
import { Player } from "@core/roster/Roster";
import { decodableBlob } from "@platform/images";
import type { Identity } from "@core/vision/Identify";
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
      else if (e.key === "e") { e.preventDefault(); document.getElementById("caption-edit")?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s, selected, picking, renaming]);

  return (
    <div className="review">
      <div className="review-bar">
        <Segmented value={s.filter} onChange={(f) => s.setFilter(f)} options={[
          { value: "all", label: `All ${counts.total}` },
          { value: "review", label: `To check ${counts.review + counts.failed}` },
          { value: "unapproved", label: `Not approved ${counts.total - counts.approved}` },
          { value: "approved", label: `Approved ${counts.approved}` },
        ]} />
        <div className="review-bar-right">
          {selected ? <span className="meta">{visible.findIndex((f) => f.id === selected.id) + 1} of {visible.length}</span> : null}
          {s.running ? (
            <>
              <div className="progress" aria-label={`Read ${s.runDone} of ${s.runTotal}`}><div className="progress-fill" style={{ width: `${(100 * s.runDone) / Math.max(1, s.runTotal)}%` }} /></div>
              <span className="meta">{s.runDone}/{s.runTotal} · {Cost.dollars(s.spent)}</span>
              <Button small onClick={() => s.cancelRun()} disabled={s.cancelRequested}>{s.cancelRequested ? "Stopping…" : "Stop"}</Button>
            </>
          ) : (
            <>
              {counts.pending + counts.failed ? <Button small onClick={() => s.startRun()}>Read {counts.pending + counts.failed} remaining</Button> : null}
              {s.frames.some((f) => f.approved && !f.written) && s.folder?.writable ? <Button small onClick={() => s.writeAllApproved()}>Write approved</Button> : null}
              {s.folder?.writable && derive.usesRosters(s) ? <Button small kind="ghost" onClick={() => setRenaming(true)}>Rename…</Button> : null}
              {s.folder && !s.folder.writable && s.frames.some((f) => f.approved) ? <Button small onClick={() => s.downloadSidecars()} title="This browser cannot write into the photographs; take the captions as .xmp sidecars instead">Download captions (.xmp)</Button> : null}
            </>
          )}
        </div>
      </div>

      <div className="review-main">
        {selected ? <Stage key={selected.id} frame={selected} onPick={setPicking} zoomKey={zoomKey} /> : <div className="stage stage-none"><p className="muted">Nothing here with this filter.</p></div>}
        <div className="inspector-wrap">
          {selected ? <Inspector frame={selected} onPick={setPicking} /> : <aside className="inspector" />}
          {picking && selected?.observation ? <PlayerPicker frame={selected} subjectID={picking} onClose={() => setPicking(null)} /> : null}
        </div>
      </div>

      <Filmstrip frames={visible} selectedID={selected?.id ?? null} />
      {renaming ? <RenameDialog onClose={() => setRenaming(false)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- filmstrip

function Filmstrip({ frames, selectedID }: { frames: Frame[]; selectedID: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector(`[data-id="${CSS.escape(selectedID ?? "")}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [selectedID]);
  return (
    <div className="filmstrip" ref={ref} role="listbox" aria-label="Photographs">
      {frames.map((f) => <FilmThumb key={f.id} frame={f} on={f.id === selectedID} />)}
    </div>
  );
}

const FilmThumb = memo(function FilmThumb({ frame, on }: { frame: Frame; on: boolean }) {
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
  return (
    <button ref={el} type="button" data-id={frame.id} role="option" aria-selected={on} title={frame.name}
      className={`film${on ? " film-on" : ""}${frame.approved ? " film-approved" : ""}${frame.state === "working" ? " film-working" : ""}`}
      onClick={(e) => { e.currentTarget.blur(); useStore.getState().select(frame.id); }}>
      {url ? <img src={url} alt="" draggable={false} /> : <span className="thumb-wait" />}
      <span className="film-dot"><StatusDot frame={frame} /></span>
    </button>
  );
});

// ---------------------------------------------------------------- stage

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
  const [showBoxes, setShowBoxes] = useState(true);
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
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

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
                  const id = frame.identities.find((i) => i.subjectId === x.id);
                  return (
                    <button key={x.id} type="button" className={`box ${statusClass(id, x)}`} onMouseDown={stop} onMouseUp={stop} onClick={() => onPick(x.id)} title="Change who this is"
                      style={{ left: `${x1 * sx}%`, top: `${y1 * sy}%`, width: `${Math.max(0.5, (x2 - x1) * sx)}%`, height: `${Math.max(0.5, (y2 - y1) * sy)}%` }}>
                      <span className="box-label">{x.id.slice(1)} {id?.player ? (id.player.role === "staff" ? id.player.lastName : `#${id.player.number} ${id.player.lastName}`) : x.number ? `#${x.number.replace(/\?/g, "_")}` : x.kind === "athlete" ? "?" : x.role || x.kind}</span>
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
        <span className="meta">{frame.name}{frame.exif?.captureDate ? ` · ${frame.exif.captureDate.toLocaleTimeString()}` : ""}</span>
        <span className="stage-tools">
          {zoomed ? <button type="button" className="link small" onClick={() => setView({ z: 1, x: 0, y: 0 })}>Fit</button> : null}
          {fit && originalWidth ? <button type="button" className="link small" title="The photograph's own pixels" onClick={() => zoomAbout(originalWidth / fit.w, fit.w / 2, fit.h / 2)}>100%</button> : null}
          {zoomed && actual ? <span className="meta">{actual}%</span> : null}
          {obs ? <button type="button" className="link small" onClick={() => setShowBoxes((v) => !v)}>{showBoxes ? "Hide boxes" : "Show boxes"}</button> : null}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- inspector

function Inspector({ frame, onPick }: { frame: Frame; onPick: (id: string) => void }) {
  const s = useStore();
  const [draft, setDraft] = useState(frame.caption);
  const [note, setNote] = useState(frame.note);
  useEffect(() => { setDraft(frame.caption); }, [frame.id, frame.caption]);
  useEffect(() => { setNote(frame.note); }, [frame.id, frame.note]);
  const ctx = useMemo(() => derive.captionContext(s, frame), [s, frame]);
  const obs = frame.observation;
  const inClause = new Set((obs?.clause.match(/\{P\d+\}/g) ?? []).map((t) => t.slice(1, -1)));
  const previous = derive.previousCaptioned(s, frame.id);

  const commit = () => { if (draft !== frame.caption) void s.editCaption(frame.id, draft); };

  return (
    <aside className="inspector" aria-label="Caption">
      <div className="insp-section">
        <div className="insp-head">
          <span className="overline">Caption</span>
          <span className="insp-head-actions">
            {frame.copyUndo ? <button type="button" className="link small" onClick={() => void s.undoCopy(frame.id)}>Copied · undo</button>
              : frame.captionEdited && obs ? <button type="button" className="link small" onClick={() => s.revertCaption(frame.id)}>Edited by hand · undo</button> : null}
            {previous && !frame.copyUndo ? (
              <button type="button" className="link small" disabled={frame.state === "working" || previous.caption === frame.caption}
                title={`Use the caption from ${previous.name}${frame.state === "pending" ? " — this photograph is then not sent to be read" : ""}`}
                onClick={() => void s.copyPreviousCaption(frame.id)}>Copy previous caption</button>
            ) : null}
          </span>
        </div>
        {frame.state === "failed" ? <p className="error small">{frame.error}</p> : null}
        {frame.state === "pending" ? <p className="muted small">Not read yet.</p> : null}
        <textarea id="caption-edit" className="input textarea caption-edit" rows={7} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); (e.target as HTMLTextAreaElement).blur(); } }} placeholder={frame.state === "done" ? "" : "The caption appears here once the photograph is read."} />
      </div>

      {obs ? (
        <div className="insp-section">
          <span className="overline">Who's in it</span>
          {obs.subjects.length === 0 ? <p className="muted small">No one named — {obs.scene === "wide" ? "a wide view" : obs.scene === "crowd" ? "the crowd" : "a group scene"}.</p> : null}
          <ol className="subjects">
            {obs.subjects.map((x, i) => {
              const id = frame.identities.find((k) => k.subjectId === x.id);
              const cls = statusClass(id, x);
              return (
                <li key={x.id} className={`subject ${cls}${inClause.has(x.id) ? "" : " subject-unused"}`}>
                  <div className="subject-main">
                    <span className="subject-n">{i + 1}</span>
                    <span className="subject-ref">{Compose.reference(x, id, ctx)}</span>
                    <Button small onClick={() => onPick(x.id)}>Change</Button>
                  </div>
                  <div className="subject-why">
                    <span className={`status-chip ${cls}`}>{id?.player?.role === "staff" ? "coach" : x.kind !== "athlete" ? x.kind : id?.status === "confirmed" ? "sure" : id?.status === "likely" ? "check" : "unnamed"}</span>
                    <span className="muted small">{id?.reason}{!inClause.has(x.id) ? " · not in the caption" : ""}</span>
                  </div>
                  {id && id.status !== "confirmed" && id.alternatives.length && id.teamKey ? (
                    <div className="alts">
                      {id.alternatives.slice(0, 4).map((p) => (
                        <button key={p.id} type="button" className="chip" onClick={() => s.setManual(frame.id, x.id, { teamKey: id.teamKey, playerID: p.id })}>#{p.number} {Player.fullName(p)}</button>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className="muted small">The play: “{obs.clause}”</p>
        </div>
      ) : null}

      <div className="insp-section">
        <span className="overline">Note for another look</span>
        <textarea className="input textarea" rows={2} placeholder="#24 is the ball carrier · this is the interception · she's the libero" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => s.setNote(frame.id, note)} />
        <Button small disabled={frame.state === "working" || s.running} onClick={() => { s.setNote(frame.id, note); void s.reread(frame.id); }}>Read again{note.trim() ? " with the note" : ""}</Button>
      </div>

      <div className="insp-foot">
        {frame.approved
          ? <Button onClick={() => s.setApproved(frame.id, false)}>Unapprove</Button>
          : <Button kind="primary" disabled={!frame.caption} onClick={() => s.approveAndNext()}>Approve</Button>}
        <span className="meta">
          {frame.approved ? (frame.written ? (s.folder?.writable ? "Written to the file" : "Approved") : frame.writeError ? <span className="error">Not written: {frame.writeError}</span> : s.folder?.writable ? "Writing…" : "Approved (read-only folder)") : null}
          {frame.model ? ` · ${frame.model.replace("claude-", "")} · ${Cost.dollars(frame.dollars)}${frame.zooms.length ? ` · ${frame.zooms.length} close look${frame.zooms.length > 1 ? "s" : ""}` : ""}` : ""}
        </span>
      </div>
    </aside>
  );
}
