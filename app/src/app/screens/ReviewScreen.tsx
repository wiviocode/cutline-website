/**
 * The review screen: the photograph on a stage, the caption and the numbers read in a rail, the
 * filmstrip below, and the action bar. Keyboard-first: arrows move, Return approves, e edits,
 * n corrects the first unread number, space zooms.
 *
 * Hot components subscribe to the slice they draw. A frame update during a run re-renders the
 * strip's list, but each thumbnail is memoised on its own frame and redraws only when that
 * frame changes.
 */

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore, derive, thumbnails, previews, THUMB_EDGE, PREVIEW_EDGE, type Frame } from "../store";
import { Button, Callout, Crest, KitChip, Menu, Overline, Segmented, TextArea, TextInput, swatchColour } from "../components";
import { useShortcuts } from "../shortcuts";
import { CaptionParts } from "@core/caption/CaptionParts";
import { CaptionRecord, type ReviewStatus } from "@core/records/CaptionRecord";
import { RosterPlayer } from "@core/roster/Roster";
import { RosterMatcher } from "@core/roster/RosterMatcher";
import { asSport } from "@core/caption/CompositionContext";
import { TeamColorArbiter } from "@core/roster/TeamColorArbiter";
import { VisionModel } from "@core/anthropic/VisionModel";

function visible(frames: Frame[], filter: ReviewStatus): Frame[] {
  if (filter === "approved") return frames.filter((f) => f.approved);
  if (filter === "needsReview") return frames.filter((f) => !f.approved);
  return frames;
}

export function ReviewScreen() {
  const frames = useStore((s) => s.frames);
  const filter = useStore((s) => s.filter);
  const selectedID = useStore((s) => s.selectedID);
  const panel = useStore((s) => s.panel);
  const step = useStore((s) => s.step);
  const approveAndAdvance = useStore((s) => s.approveAndAdvance);
  const list = useMemo(() => visible(frames, filter), [frames, filter]);
  const frame = useMemo(() => (selectedID ? list.find((f) => f.id === selectedID) ?? list[0] ?? null : list[0] ?? null), [list, selectedID]);
  const position = frame ? list.findIndex((f) => f.id === frame.id) + 1 : 0;

  const [editing, setEditing] = useState(false);
  const [pop, setPop] = useState<{ slot: number; value: string } | null>(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => { setEditing(false); setPop(null); setZoom(false); }, [frame?.id]);

  useShortcuts({
    ArrowRight: () => { step(1); setZoom(false); },
    ArrowLeft: () => { step(-1); setZoom(false); },
    Enter: () => void approveAndAdvance(),
    e: () => { if (frame) setEditing(true); },
    " ": () => setZoom((z) => !z),
    n: () => {
      if (!frame?.record) return;
      const players = CaptionRecord.correctedVision(frame.record).players;
      let slot = players.findIndex((p) => !p.jerseyNumber);
      if (slot < 0 && players.length) slot = 0;
      if (slot >= 0) setPop({ slot, value: players[slot].jerseyNumber });
    },
  }, !panel && !editing && !pop);

  return (
    <div className="screen">
      <Header list={list} position={position} frame={frame} />
      <KitColourAlarm />
      <main className="review-main">
        <Stage frame={frame} zoom={zoom} onToggleZoom={() => setZoom((z) => !z)} />
        <aside className="rail" aria-label="Caption">
          {frame ? <Rail frame={frame} editing={editing} setEditing={setEditing} pop={pop} setPop={setPop} /> : <div className="rail-body dim">Nothing to show for this filter.</div>}
        </aside>
      </main>
      <Filmstrip list={list} currentID={frame?.id ?? null} />
      <ActionBar />
    </div>
  );
}

function Header({ list, position, frame }: { list: Frame[]; position: number; frame: Frame | null }) {
  const s = useStore();
  const counts = derive.counts(s);
  const title = derive.eventTitle(s);
  return (
    <header className="review-head">
      <Button variant="secondary" className="back" onClick={() => s.setScreen("game")} title="Back to the game — the shoot and its captions are kept">
        <svg viewBox="0 0 16 16" width={13} height={13} aria-hidden="true"><path d="M10 2.5 4.5 8 10 13.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Back
      </Button>
      <span className="divider" aria-hidden="true" />
      {s.rosterMode === "noTeams" ? <b className="team">{title}</b> : (
        <>
          <Crest name={s.home.name} colour={s.home.colour} logoURL={s.home.team ? s.logoURLs[s.home.team.id] : null} /><span className="team">{s.home.name}</span>
          <span className="sep">vs</span>
          <Crest name={s.away.name} colour={s.away.colour} logoURL={s.away.team ? s.logoURLs[s.away.team.id] : null} /><span className="team">{s.away.name}</span>
        </>
      )}
      <span className="spacer" />
      <Segmented<ReviewStatus> ariaLabel="Filter" value={s.filter} onChange={(f) => s.setFilter(f)}
        options={[{ id: "needsReview", label: `Needs review ${counts.needsReview}` }, { id: "approved", label: `Approved ${counts.approved}` }, { id: "all", label: `All ${counts.all}` }]} />
      <span className="pos">{frame ? `${position} of ${list.length}` : "—"}</span>
      {counts.needsNumber > 0 && <button type="button" className="linky" onClick={(e) => { e.currentTarget.blur(); s.nextNeedingNumber(); }}>next unread number →</button>}
    </header>
  );
}

function KitColourAlarm() {
  const frames = useStore((s) => s.frames);
  const rosterMode = useStore((s) => s.rosterMode);
  const home = useStore((s) => s.home);
  const away = useStore((s) => s.away);
  const setKitColour = useStore((s) => s.setKitColour);
  const colours = useMemo(() => derive.kitColourWarning(useStore.getState()), [frames, rosterMode, home, away]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!colours.length) return null;
  const top = colours[0];
  return (
    <div className="callout callout-warn alarm" role="status">
      <span className="callout-glyph" aria-hidden="true">!</span>
      <div className="callout-body">
        <b>{top.count} players in {top.colour} matched neither team.</b> A kit colour set to what a side usually wears rather than what it wore names nobody — and the captions still read as correct English.
        <div className="callout-actions">
          <Button variant="secondary" onClick={() => void setKitColour(top.colour, "home")}>{home.name || "Home"} wore {top.colour}</Button>
          <Button variant="secondary" onClick={() => void setKitColour(top.colour, "away")}>{away.name || "Away"} wore {top.colour}</Button>
        </div>
      </div>
    </div>
  );
}

const ZOOM = 2.4;

/**
 * The photograph, filling the stage. The strip's thumbnail is shown at full size the instant a
 * frame is chosen, so nothing is ever small or blank while the large decode runs. A click zooms
 * in on that point; zoomed in, the picture can be dragged, and a click that did not move zooms
 * back out.
 */
function Stage({ frame, zoom, onToggleZoom }: { frame: Frame | null; zoom: boolean; onToggleZoom: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [origin, setOrigin] = useState("50% 50%");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let alive = true;
    setUrl(frame ? previews.cached(frame.id) ?? thumbnails.cached(frame.id) : null);
    if (frame) void previews.url(frame.id, () => frame.photo.file(), PREVIEW_EDGE).then((u) => { if (alive) setUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [frame?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPan({ x: 0, y: 0 }); }, [zoom, frame?.id]);

  // Mouse events rather than pointer events: every pointer fires them, and so does anything that
  // drives the page synthetically. The move and release are watched on the window, so a drag
  // that leaves the stage still ends cleanly.
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const toggleRef = useRef(onToggleZoom); toggleRef.current = onToggleZoom;
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      if (!zoomRef.current) return;
      // Keep some of the picture on the stage however far it is dragged.
      const el = img.current;
      const limitX = el ? (ZOOM - 1) * el.offsetWidth : Infinity;
      const limitY = el ? (ZOOM - 1) * el.offsetHeight : Infinity;
      setDragging(true);
      setPan({ x: Math.max(-limitX, Math.min(limitX, d.px + dx)), y: Math.max(-limitY, Math.min(limitY, d.py + dy)) });
    };
    const up = (e: MouseEvent) => {
      const d = drag.current;
      drag.current = null;
      setDragging(false);
      if (!d || (d.moved && zoomRef.current)) return; // a drag, not a click
      if (!zoomRef.current) {
        const r = img.current?.getBoundingClientRect();
        if (r) setOrigin(`${Math.round(((e.clientX - r.left) / r.width) * 100)}% ${Math.round(((e.clientY - r.top) / r.height) * 100)}%`);
      }
      toggleRef.current();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div className={"stage" + (zoom ? " zoomed" : "") + (dragging ? " dragging" : "")} onMouseDown={onMouseDown}>
      {url ? <img ref={img} src={url} alt={frame?.name ?? ""} draggable={false}
        style={{ transformOrigin: origin, transform: zoom ? `translate(${pan.x}px, ${pan.y}px) scale(${ZOOM})` : "none", transition: dragging ? "none" : undefined }} />
        : <div className="stage-empty">{frame ? "Loading…" : "Nothing selected"}</div>}
      {frame && <span className="stage-name">{frame.name}</span>}
      <div onMouseDown={stop} onMouseUp={stop} onClick={stop} style={{ display: "contents" }}><StartCard /></div>
    </div>
  );
}

/** On a fresh shoot the one thing to do is start, so it sits where the eye is. */
function StartCard() {
  const v = useStore(useShallow((s) => ({
    pending: derive.pendingCount(s), ready: derive.readyToRun(s), touched: s.frames.some((f) => f.state !== "pending"), running: s.isRunning,
    hasKey: !!s.apiKey, total: s.frames.length, model: VisionModel.byID(s.settings.model).name,
  })));
  const run = useStore((s) => s.run);
  if (v.running || v.touched || v.pending === 0) return null;
  return (
    <div className="stage-cta" role="group" aria-label="Start captioning">
      <b>{v.total} photograph{v.total === 1 ? "" : "s"} ready.</b>
      <span>{v.hasKey ? `${v.model} reads each one, and the caption is written into the file as it comes back.` : "Add your Anthropic API key in Settings to begin."}</span>
      <div className="stage-cta-actions">
        <Button size="lg" disabled={!v.ready} onClick={(e) => { e.currentTarget.blur(); void run(); }}>Caption them</Button>
        {v.pending > 10 && <Button variant="secondary" size="lg" disabled={!v.ready} onClick={(e) => { e.currentTarget.blur(); void run({ limit: 10 }); }} title="Caption ten, check them, then do the rest">Try 10 first</Button>}
      </div>
    </div>
  );
}

function Rail({ frame, editing, setEditing, pop, setPop }: { frame: Frame; editing: boolean; setEditing: (b: boolean) => void; pop: { slot: number; value: string } | null; setPop: (p: { slot: number; value: string } | null) => void }) {
  const rosterMode = useStore((s) => s.rosterMode);
  const home = useStore((s) => s.home);
  const away = useStore((s) => s.away);
  const sportID = useStore((s) => s.selection.sportID);
  const updateCaption = useStore((s) => s.updateCaption);
  const assignNumber = useStore((s) => s.assignNumber);
  const recaption = useStore((s) => s.recaption);
  const setApproved = useStore((s) => s.setApproved);
  const approveAndAdvance = useStore((s) => s.approveAndAdvance);
  const setKitColour = useStore((s) => s.setKitColour);
  const roster = useMemo(() => derive.roster(useStore.getState()), [rosterMode, home, away]); // eslint-disable-line react-hooks/exhaustive-deps
  const matcher = useMemo(() => new RosterMatcher(roster, asSport(sportID)), [roster, sportID]);

  const [draft, setDraft] = useState(frame.caption);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { setDraft(frame.caption); setNoteOpen(false); setNote(""); }, [frame.id, frame.caption]);

  const spans = CaptionParts.split(frame.caption, roster);
  const players = frame.record ? CaptionRecord.correctedVision(frame.record).players : [];
  // A numbered jersey in a colour neither team is set to names nobody. Say so here, on the frame
  // where it shows, with the two one-click fixes — the shoot-wide alarm waits for a pattern.
  const orphan = rosterMode === "noTeams" ? null : (() => {
    const lost = players.filter((p) => p.jerseyNumber && p.jerseyColor.trim() && !TeamColorArbiter.team(roster, p.jerseyColor));
    if (!lost.length) return null;
    const colour = lost[0].jerseyColor.trim().toLowerCase();
    return { colour, numbers: lost.filter((p) => p.jerseyColor.trim().toLowerCase() === colour).map((p) => "#" + p.jerseyNumber) };
  })();

  const save = () => {
    const text = draft.replace(/\s*\n+\s*/g, " ").trim();
    if (text) void updateCaption(frame.id, text);
    setEditing(false);
  };
  const applyPop = () => {
    if (!pop) return;
    const value = pop.value.trim();
    if (value) void assignNumber(frame.id, pop.slot, value);
    setPop(null);
  };
  const redo = (text: string) => { void recaption(frame.id, text.trim()); setNoteOpen(false); setNote(""); };
  const working = frame.state === "working";
  const state = frame.state === "failed" ? `Failed: ${frame.error}` : working ? "Captioning…" : frame.state === "pending" ? "Not captioned yet"
    : frame.writeError ? `Not written: ${frame.writeError}` : frame.edited ? "Edited and written into the photograph" : "Written into the photograph";

  return (
    <>
      <div className="rail-body">
        <div>
          <Overline style={{ marginBottom: 6 }}>Caption</Overline>
          {!editing ? (
            <div className="caption" role="button" tabIndex={0} title="Click to edit — or press e" onClick={() => setEditing(true)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); setEditing(true); } }}>
              {frame.caption ? spans.map((sp) => (sp.player ? <b key={sp.id} title={sp.team?.name ?? ""}>{sp.text}</b> : <span key={sp.id}>{sp.text}</span>)) : <span className="placeholder">{frame.state === "pending" ? "Not captioned yet." : working ? "Captioning…" : "—"}</span>}
            </div>
          ) : (
            <div>
              <TextArea value={draft} autoFocus minHeight={110} onChange={(e) => setDraft(e.target.value)} onBlur={save} ariaLabel="Caption"
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === "Escape") { setDraft(frame.caption); setEditing(false); } }} />
              <div className="editor-hint"><span>⏎ save</span><span>esc cancel</span></div>
            </div>
          )}
        </div>

        {frame.record && players.length > 0 && <div>
          <Overline style={{ marginBottom: 6 }}>Numbers read</Overline>
          <div className="chips">
            {players.map((p, slot) => {
              const m = p.jerseyNumber ? matcher.match(p.jerseyNumber, p.jerseyColor, p.action, p.flags, p.unit) : null;
              const name = m?.ok ? RosterPlayer.fullName(m.match.player) : null;
              return <KitChip key={slot} number={p.jerseyNumber || "?"} name={name} colour={swatchColour(p.jerseyColor)} flagged={!p.jerseyNumber}
                title={m?.ok && m.match.wasFuzzy ? `Corrected from ${p.jerseyNumber}` : "Click to correct the number"}
                onClick={() => setPop({ slot, value: p.jerseyNumber })} />;
            })}
          </div>
          {orphan && (
            <div style={{ marginTop: 10 }}>
              <Callout kind="warn" actions={<>
                <Button variant="secondary" onClick={() => void setKitColour(orphan.colour, "home")}>{home.name || "Home"} wore {orphan.colour}</Button>
                <Button variant="secondary" onClick={() => void setKitColour(orphan.colour, "away")}>{away.name || "Away"} wore {orphan.colour}</Button>
              </>}>
                <b>{orphan.numbers.join(", ")} in {orphan.colour} matched neither team.</b> Say who wore {orphan.colour} and every caption is rebuilt, with no new requests.
              </Callout>
            </div>
          )}
          {pop && (
            <div className="pop" role="dialog" aria-label="Jersey number">
              <b>Jersey number</b>
              <TextInput mono autoFocus value={pop.value} ariaLabel="Jersey number" onChange={(e) => setPop({ ...pop, value: e.target.value })}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") applyPop(); if (e.key === "Escape") setPop(null); }} />
              <p className="note">The caption is rebuilt from the roster — no new request to the model.</p>
              <div className="pop-row"><Button variant="ghost" onClick={() => setPop(null)}>Cancel</Button><Button onClick={applyPop}>Set</Button></div>
            </div>
          )}
        </div>}

        {frame.record && (
          <div className="redo">
            <Overline style={{ marginBottom: 6 }}>Not right?</Overline>
            {working ? (
              <p className="note busy-note"><span className="busy-dot" aria-hidden="true" />Reading the photograph again…</p>
            ) : !noteOpen ? (
              <>
                <div className="redo-actions">
                  <Button variant="secondary" onClick={(e) => { e.currentTarget.blur(); setNoteOpen(true); }}>Redo with a note…</Button>
                  <Button variant="ghost" onClick={(e) => { e.currentTarget.blur(); redo(""); }} title="Send the photograph again with no note">Redo as is</Button>
                </div>
                <p className="note">A note corrects what the model <em>read</em> — a number, a colour, who has the ball, the play. The wording is built here from that reading, so to change the words, edit the caption above.</p>
              </>
            ) : (
              <>
                <TextArea value={note} autoFocus minHeight={62} rows={3} placeholder="No. 22 in white is the tackler, not the runner · they wore black tonight · this is the interception" ariaLabel="Note to the model" onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { setNoteOpen(false); setNote(""); } if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && note.trim()) redo(note); }} />
                <div className="redo-row">
                  <Button disabled={!note.trim()} onClick={() => redo(note)}>Redo with this note</Button>
                  <button type="button" className="linky" onClick={() => { setNoteOpen(false); setNote(""); }}>cancel</button>
                </div>
              </>
            )}
          </div>
        )}
        {frame.altText && <div><Overline style={{ marginBottom: 6 }}>Alt text</Overline><div className="dim small selectable">{frame.altText}</div></div>}
      </div>
      <div className="rail-foot">
        {frame.approved
          ? <button type="button" className="approve done" onClick={() => void setApproved(frame.id, false)}>✓  Approved — click to reopen</button>
          : <button type="button" className="approve" onClick={() => void approveAndAdvance()}>Approve and next  ⏎</button>}
        <div className="state">{state}</div>
        <div className="keys" aria-hidden="true"><span><kbd>← →</kbd>move</span><span><kbd>e</kbd>edit</span><span><kbd>n</kbd>number</span><span><kbd>space</kbd>zoom</span></div>
      </div>
    </>
  );
}

function Filmstrip({ list, currentID }: { list: Frame[]; currentID: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }, [currentID]);
  return (
    <div className="strip" ref={ref} role="listbox" aria-label="Photographs">
      {list.map((f) => <Thumb key={f.id} frame={f} on={f.id === currentID} />)}
    </div>
  );
}

const Thumb = memo(function Thumb({ frame, on }: { frame: Frame; on: boolean }) {
  const [url, setUrl] = useState<string | null>(() => thumbnails.cached(frame.id));
  const el = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (url) return;
    const node = el.current;
    if (!node) return;
    let alive = true;
    // A thumbnail is only asked for once it nears the viewport.
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void thumbnails.url(frame.id, () => frame.photo.file(), THUMB_EDGE).then((u) => { if (alive) setUrl(u); }).catch(() => {});
      }
    }, { root: node.parentElement, rootMargin: "400px" });
    io.observe(node);
    return () => { alive = false; io.disconnect(); };
  }, [frame.id, url]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button ref={el} type="button" role="option" aria-selected={on} title={frame.name}
      className={"thumb" + (on ? " on" : "") + (frame.approved ? " approved" : "") + (frame.state === "working" ? " working" : "") + (frame.state === "failed" ? " failed" : "")}
      onClick={(e) => { e.currentTarget.blur(); useStore.getState().select(frame.id); }}>
      {url ? <img src={url} alt="" /> : null}
      {frame.needsNumber && <span className="thumb-flag" aria-label="a number could not be read">?</span>}
    </button>
  );
});

function ActionBar() {
  const v = useStore(useShallow((s) => ({
    running: s.isRunning, done: s.progressDone, total: s.progressTotal, status: s.statusLine, bulk: s.bulkLabel, hasKey: !!s.apiKey, tokens: s.tokensIn,
    pending: derive.pendingCount(s), failed: derive.failedCount(s), ready: derive.readyToRun(s), anyDone: derive.anyDone(s), count: s.frames.length, cost: derive.estimatedCost(s),
  })));
  const run = useStore((s) => s.run);
  const cancel = useStore((s) => s.cancel);
  const setPanel = useStore((s) => s.setPanel);
  const go = (fn: () => void) => (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.blur(); fn(); };
  return (
    <nav className="bar run-bar" aria-label="Captioning">
      <span className={"status " + (!v.hasKey ? "problem" : "dim")} role="status">{!v.hasKey ? "Add your Anthropic API key in Settings to caption." : v.status}{v.bulk ? ` · ${v.bulk}` : ""}</span>
      {v.tokens > 0 && <span className="dim mono small" title="Estimated cost of this run so far, at the list price of the model that ran">${v.cost.toFixed(2)}</span>}
      {v.running ? (
        <>
          <progress max={Math.max(v.total, 1)} value={v.done} aria-label="Progress" />
          <Button variant="secondary" onClick={go(cancel)}>Stop</Button>
        </>
      ) : (
        <>
          {v.anyDone && <Menu label="More" items={[
            { label: "Redo every caption…", disabled: !v.ready, onSelect: () => { if (window.confirm(`Caption all ${v.count} photographs again? Each one is a new request to the model.`)) void run({ redo: true }); } },
            { label: "Rename photographs…", onSelect: () => setPanel("rename") },
          ]} />}
          {v.pending > 10 && <Button variant="secondary" disabled={!v.ready} onClick={go(() => void run({ limit: 10 }))} title="Caption ten, check them, then do the rest">Try 10 first</Button>}
          {v.pending > 0 && <Button disabled={!v.ready} onClick={go(() => void run())}>Caption {v.pending} photograph{v.pending === 1 ? "" : "s"}</Button>}
          {v.pending === 0 && v.failed > 0 && <Button disabled={!v.ready} onClick={go(() => void run({ failed: true }))}>Retry {v.failed} failed</Button>}
        </>
      )}
    </nav>
  );
}

export { Callout };
