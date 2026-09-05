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
      <Button variant="secondary" onClick={() => s.setScreen("game")} title="Back to the game">‹ Game</Button>
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

function Stage({ frame, zoom, onToggleZoom }: { frame: Frame | null; zoom: boolean; onToggleZoom: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [origin, setOrigin] = useState("50% 50%");
  useEffect(() => {
    let alive = true;
    // The thumbnail stands in while a 20 MB frame decodes, so the stage is never blank.
    setUrl(frame ? previews.cached(frame.id) ?? thumbnails.cached(frame.id) : null);
    if (frame) void previews.url(frame.id, () => frame.photo.file(), PREVIEW_EDGE).then((u) => { if (alive) setUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [frame?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = (e.currentTarget.querySelector("img") as HTMLImageElement | null)?.getBoundingClientRect();
    if (r) setOrigin(`${Math.round(((e.clientX - r.left) / r.width) * 100)}% ${Math.round(((e.clientY - r.top) / r.height) * 100)}%`);
    onToggleZoom();
  };
  return (
    <div className={"stage" + (zoom ? " zoomed" : "")} onClick={onClick} title={zoom ? "Click to fit" : "Click to zoom in at that point — or press space"}>
      {url ? <img src={url} alt={frame?.name ?? ""} style={{ transformOrigin: origin, transform: zoom ? "scale(2.4)" : "none" }} /> : <div className="stage-empty">{frame ? "Loading…" : "Nothing selected"}</div>}
      {frame && <span className="stage-name">{frame.name}</span>}
      <StartCard />
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
    <div className="stage-cta" role="group" aria-label="Start captioning" onClick={(e) => e.stopPropagation()}>
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
  const state = frame.state === "failed" ? `Failed: ${frame.error}` : frame.state === "working" ? "Captioning…" : frame.state === "pending" ? "Not captioned yet"
    : frame.writeError ? `Not written: ${frame.writeError}` : frame.edited ? "Edited and written into the photograph" : "Written into the photograph";

  return (
    <>
      <div className="rail-body">
        <div>
          <Overline style={{ marginBottom: 6 }}>Caption</Overline>
          {!editing ? (
            <div className="caption" role="button" tabIndex={0} title="Click to edit — or press e" onClick={() => setEditing(true)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); setEditing(true); } }}>
              {frame.caption ? spans.map((sp) => (sp.player ? <b key={sp.id} title={sp.team?.name ?? ""}>{sp.text}</b> : <span key={sp.id}>{sp.text}</span>)) : <span className="placeholder">{frame.state === "pending" ? "Not captioned yet." : frame.state === "working" ? "Captioning…" : "—"}</span>}
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
              const m = p.jerseyNumber ? matcher.match(p.jerseyNumber, p.jerseyColor, p.action) : null;
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
          <div>
            {!noteOpen ? (
              <button type="button" className="redo-open" onClick={(e) => { e.currentTarget.blur(); setNoteOpen(true); }}>Redo with a note to the model…</button>
            ) : (
              <>
                <TextArea value={note} autoFocus minHeight={62} rows={3} placeholder="A change kit, a borrowed number, who is who…" ariaLabel="Note to the model" onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { setNoteOpen(false); setNote(""); } }} />
                <div className="redo-row">
                  <Button variant="secondary" disabled={frame.state === "working"} onClick={() => { void recaption(frame.id, note); setNoteOpen(false); setNote(""); }}>{frame.state === "working" ? "Captioning…" : note.trim() ? "Redo with this note" : "Redo caption"}</Button>
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
