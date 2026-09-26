import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, derive, type Frame } from "../store";
import { Button, Kbd, Segmented, StatusDot, Thumb, Spinner } from "../components";
import { PlayerPicker } from "./PlayerPicker";
import { RenameDialog } from "./Rename";
import { Compose } from "@core/caption/Compose";
import { Cost } from "@core/ai/Models";
import { Player } from "@core/roster/Roster";
import type { Identity } from "@core/vision/Identify";
import type { Subject } from "@core/vision/Observation";

export function Review() {
  const s = useStore();
  const visible = derive.visible(s);
  const selected = s.frames.find((f) => f.id === s.selectedID) ?? visible[0] ?? null;
  const [picking, setPicking] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const counts = derive.counts(s);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable;
      if (picking || renaming || useStore.getState().panel) return;
      if (typing) { if (e.key === "Escape") t.blur(); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); s.step(1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); s.step(-1); }
      else if (e.key === "Enter") { e.preventDefault(); void s.approveAndNext(); }
      else if (/^[1-4]$/.test(e.key) && selected?.observation?.subjects[Number(e.key) - 1]) { e.preventDefault(); setPicking(selected.observation.subjects[Number(e.key) - 1].id); }
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

      <div className="review-body">
        <Strip frames={visible} selectedID={selected?.id ?? null} />
        {selected ? <Stage frame={selected} onPick={setPicking} /> : <div className="stage empty"><p className="muted">Nothing here with this filter.</p></div>}
        {selected ? <Inspector frame={selected} onPick={setPicking} /> : <aside className="inspector" />}
      </div>

      {picking && selected?.observation ? <PlayerPicker frame={selected} subjectID={picking} onClose={() => setPicking(null)} /> : null}
      {renaming ? <RenameDialog onClose={() => setRenaming(false)} /> : null}
    </div>
  );
}

function Strip({ frames, selectedID }: { frames: Frame[]; selectedID: string | null }) {
  const select = useStore((s) => s.select);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector(`[data-id="${CSS.escape(selectedID ?? "")}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedID]);
  return (
    <div className="strip" ref={ref} role="listbox" aria-label="Photographs">
      {frames.map((f) => (
        <button key={f.id} type="button" data-id={f.id} role="option" aria-selected={f.id === selectedID} className={`strip-item${f.id === selectedID ? " strip-on" : ""}`} onClick={() => select(f.id)}>
          <Thumb frame={f} />
          <span className="strip-name"><StatusDot frame={f} />{f.name}</span>
        </button>
      ))}
    </div>
  );
}

function statusClass(id: Identity | undefined, s: Subject): string {
  if (s.kind !== "athlete") return "box-other";
  return !id ? "box-unknown" : id.status === "confirmed" ? "box-confirmed" : id.status === "likely" ? "box-likely" : "box-unknown";
}

function Stage({ frame, onPick }: { frame: Frame; onPick: (id: string) => void }) {
  const img = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ w: number; h: number; x: number; y: number } | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);

  // The boxes are measured on the frame that was sent; they are drawn over the image as shown.
  useEffect(() => {
    const el = img.current;
    if (!el) return;
    const measure = () => {
      const i = el.querySelector("img");
      if (!i || !i.naturalWidth) return;
      const box = el.getBoundingClientRect();
      const scale = Math.min(box.width / i.naturalWidth, box.height / i.naturalHeight);
      const w = i.naturalWidth * scale, h = i.naturalHeight * scale;
      setRect({ w, h, x: (box.width - w) / 2, y: (box.height - h) / 2 });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const t = setInterval(measure, 300);
    measure();
    return () => { ro.disconnect(); clearInterval(t); };
  }, [frame.id]);

  const obs = frame.observation;
  return (
    <div className="stage">
      <div className="stage-img" ref={img}>
        <Thumb key={frame.id} frame={frame} size="preview" />
        {showBoxes && obs && frame.sent && rect ? (
          <div className="boxes" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
            {obs.subjects.filter((x) => x.box).map((x) => {
              const [x1, y1, x2, y2] = x.box!;
              const sx = rect.w / frame.sent!.width, sy = rect.h / frame.sent!.height;
              const id = frame.identities.find((i) => i.subjectId === x.id);
              return (
                <button key={x.id} type="button" className={`box ${statusClass(id, x)}`} style={{ left: x1 * sx, top: y1 * sy, width: Math.max(8, (x2 - x1) * sx), height: Math.max(8, (y2 - y1) * sy) }}
                  onClick={() => onPick(x.id)} title="Change who this is">
                  <span className="box-label">{x.id.slice(1)} {id?.player ? `#${id.player.number} ${id.player.lastName}` : x.number ? `#${x.number.replace(/\?/g, "_")}` : x.kind === "athlete" ? "?" : x.role || x.kind}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {frame.state === "working" ? <div className="stage-working"><Spinner /> Reading…</div> : null}
      </div>
      <div className="stage-foot">
        <span className="meta">{frame.name}{frame.exif?.captureDate ? ` · ${frame.exif.captureDate.toLocaleTimeString()}` : ""}</span>
        {obs ? <button type="button" className="link small" onClick={() => setShowBoxes((v) => !v)}>{showBoxes ? "Hide boxes" : "Show boxes"}</button> : null}
      </div>
    </div>
  );
}

function Inspector({ frame, onPick }: { frame: Frame; onPick: (id: string) => void }) {
  const s = useStore();
  const [draft, setDraft] = useState(frame.caption);
  const [note, setNote] = useState(frame.note);
  useEffect(() => { setDraft(frame.caption); }, [frame.id, frame.caption]);
  useEffect(() => { setNote(frame.note); }, [frame.id, frame.note]);
  const ctx = useMemo(() => derive.captionContext(s, frame), [s, frame]);
  const obs = frame.observation;
  const inClause = new Set((obs?.clause.match(/\{P\d+\}/g) ?? []).map((t) => t.slice(1, -1)));

  const commit = () => { if (draft !== frame.caption) void s.editCaption(frame.id, draft); };

  return (
    <aside className="inspector" aria-label="Caption">
      <div className="insp-section">
        <div className="insp-head">
          <span className="overline">Caption</span>
          {frame.captionEdited && obs ? <button type="button" className="link small" onClick={() => s.revertCaption(frame.id)}>Edited by hand · undo</button> : null}
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
                    <span className={`status-chip ${cls}`}>{x.kind !== "athlete" ? x.kind : id?.status === "confirmed" ? "sure" : id?.status === "likely" ? "check" : "unnamed"}</span>
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
          : <Button kind="primary" disabled={!frame.caption} onClick={() => s.approveAndNext()}>Approve <Kbd>↵</Kbd></Button>}
        <span className="meta">
          {frame.approved ? (frame.written ? (s.folder?.writable ? "Written to the file" : "Approved") : frame.writeError ? <span className="error">Not written: {frame.writeError}</span> : s.folder?.writable ? "Writing…" : "Approved (read-only folder)") : null}
          {frame.model ? ` · ${frame.model.replace("claude-", "")} · ${Cost.dollars(frame.dollars)}${frame.zooms.length ? ` · ${frame.zooms.length} close look${frame.zooms.length > 1 ? "s" : ""}` : ""}` : ""}
        </span>
      </div>
      <p className="muted small keys"><Kbd>←</Kbd><Kbd>→</Kbd> move · <Kbd>↵</Kbd> approve · <Kbd>1</Kbd>–<Kbd>4</Kbd> change a player · <Kbd>E</Kbd> edit</p>
    </aside>
  );
}
