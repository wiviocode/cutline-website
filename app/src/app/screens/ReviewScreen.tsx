/**
 * The review screen: the photograph on a stage, the caption and the numbers read in a rail, the
 * filmstrip below, and the run bar. Keyboard-first: arrows move, Return approves, e edits, n
 * corrects the first unread number, space zooms.
 */

import React, { useEffect, useRef, useState } from "react";
import { useStore, derive, thumbnails, previews, THUMB_EDGE, PREVIEW_EDGE, type Frame } from "../store";
import { Button, KitChip, Overline, Segmented, TextArea, TextInput, Crest, swatchColour } from "../components";
import { CaptionParts } from "@core/caption/CaptionParts";
import { CaptionRecord, REVIEW_STATUSES } from "@core/records/CaptionRecord";
import { RosterPlayer } from "@core/roster/Roster";
import { RosterMatcher } from "@core/roster/RosterMatcher";
import { asSport } from "@core/caption/CompositionContext";
import { WireStyle } from "@core/caption/WireStyle";

export function ReviewScreen() {
  const s = useStore();
  const frame = derive.selected(s);
  const [editing, setEditing] = useState(false);
  const [pop, setPop] = useState<{ slot: number; value: string } | null>(null);
  const [zoom, setZoom] = useState(false);
  const counts = derive.counts(s);
  const warning = derive.kitColourWarning(s);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || pop || s.panel) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); s.step(1); setZoom(false); }
      if (e.key === "ArrowLeft") { e.preventDefault(); s.step(-1); setZoom(false); }
      if (e.key === "Enter") { e.preventDefault(); void s.approveAndAdvance(); }
      if (e.key === "e" && frame) { e.preventDefault(); setEditing(true); }
      if (e.key === " ") { e.preventDefault(); setZoom((z) => !z); }
      if (e.key === "n" && frame?.record) {
        e.preventDefault();
        const players = CaptionRecord.correctedVision(frame.record).players;
        let slot = players.findIndex((p) => !p.jerseyNumber);
        if (slot < 0 && players.length) slot = 0;
        if (slot >= 0) setPop({ slot, value: players[slot].jerseyNumber });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => { setEditing(false); setPop(null); setZoom(false); }, [frame?.id]);

  return (
    <div className="screen">
      <header className="bar shoot-bar">
        <Button variant="secondary" onClick={() => s.setScreen("setup")}>‹ Game</Button>
        <span className="divider" />
        {s.rosterMode === "noTeams" ? <b className="team">{derive.eventTitle(s)}</b> : (
          <>
            <Crest name={s.home.name} colour={s.home.colour} logoURL={s.home.team ? s.logoURLs[s.home.team.id] : null} /><b className="team">{s.home.name}</b>
            <span className="sep">vs</span>
            <Crest name={s.away.name} colour={s.away.colour} logoURL={s.away.team ? s.logoURLs[s.away.team.id] : null} /><b className="team">{s.away.name}</b>
          </>
        )}
        <span className="dim">{[derive.sportLabel(s), s.venue].filter(Boolean).join(" · ")}</span>
        <span className="spacer" />
        <span className="dim">{WireStyle.displayName(s.settings.style)} style</span>
      </header>

      {warning.length > 0 && <KitColourBanner colours={warning} />}

      <div className="bar filter-bar">
        <Segmented options={[{ id: "needsReview", label: `Needs review ${counts.needsReview}` }, { id: "approved", label: `Approved ${counts.approved}` }, { id: "all", label: `All ${counts.all}` }]}
          value={s.filter} onChange={(f) => s.setFilter(f)} />
        <span className="dim mono">{frame ? `${derive.visibleFrames(s).findIndex((f) => f.id === frame.id) + 1} of ${derive.visibleFrames(s).length}` : "—"}</span>
        {counts.needsNumber > 0 && <button type="button" className="linky" onClick={() => s.nextNeedingNumber()}>next unread number →</button>}
        <span className="spacer" />
        <span className="dim mono">{frame?.name}</span>
      </div>

      <main className="review-main">
        <Stage frame={frame} zoom={zoom} onToggleZoom={() => setZoom((z) => !z)} />
        <aside className="rail">
          {frame ? <Rail frame={frame} editing={editing} setEditing={setEditing} pop={pop} setPop={setPop} /> : <div className="rail-body dim">No frame selected.</div>}
        </aside>
      </main>

      <Filmstrip />

      <nav className="bar run-bar">
        <span className={"status " + (!s.apiKey ? "warn-text" : "dim")}>{!s.apiKey ? "Add your Anthropic API key in Settings" : s.statusLine}{s.bulkLabel ? ` · ${s.bulkLabel}` : ""}</span>
        <span className="spacer" />
        {s.tokensIn > 0 && <span className="dim mono" title="Estimated cost for this run">${derive.estimatedCost(s).toFixed(2)}</span>}
        {s.isRunning ? (
          <>
            <progress max={Math.max(s.progressTotal, 1)} value={s.progressDone} />
            <Button variant="secondary" onClick={() => s.cancel()}>Stop</Button>
          </>
        ) : (
          <>
            <Button disabled={!derive.readyToRun(s) || derive.pendingCount(s) === 0} onClick={() => void s.run()}>Caption photos</Button>
            {derive.pendingCount(s) > 10 && <Button variant="secondary" disabled={!derive.readyToRun(s)} onClick={() => void s.run({ limit: 10 })}>Test 10</Button>}
            {derive.anyDone(s) && <Button variant="secondary" disabled={!derive.readyToRun(s)} onClick={() => void s.run({ redo: true })}>Redo all</Button>}
            {derive.anyDone(s) && <Button variant="secondary" onClick={() => s.setPanel("rename")}>Rename photos…</Button>}
          </>
        )}
      </nav>
    </div>
  );
}

function KitColourBanner({ colours }: { colours: { colour: string; count: number }[] }) {
  const s = useStore();
  const top = colours[0];
  return (
    <div className="banner">
      <span className="glyph">!</span>
      <div>
        <b>{top.count} players in {top.colour} matched neither team.</b> A kit colour set to what a side usually wears rather than what it wore names nobody — and the captions still read as correct English.
        <div className="banner-actions">
          <Button variant="secondary" onClick={() => void s.setKitColour(top.colour, "home")}>{s.home.name || "Home"} wore {top.colour}</Button>
          <Button variant="secondary" onClick={() => void s.setKitColour(top.colour, "away")}>{s.away.name || "Away"} wore {top.colour}</Button>
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
    setUrl(frame ? previews.cached(frame.id) : null);
    if (frame) void previews.url(frame.id, () => frame.photo.file(), PREVIEW_EDGE).then((u) => { if (alive) setUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [frame?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = (e.currentTarget.querySelector("img") as HTMLImageElement | null)?.getBoundingClientRect();
    if (r) setOrigin(`${Math.round(((e.clientX - r.left) / r.width) * 100)}% ${Math.round(((e.clientY - r.top) / r.height) * 100)}%`);
    onToggleZoom();
  };
  return (
    <div className={"stage" + (zoom ? " zoomed" : "")} onClick={onClick}>
      {url ? <img src={url} alt="" style={{ transformOrigin: origin, transform: zoom ? "scale(2.4)" : "none" }} /> : <div className="stage-empty">{frame ? "Loading…" : "Nothing selected"}</div>}
    </div>
  );
}

function Rail({ frame, editing, setEditing, pop, setPop }: { frame: Frame; editing: boolean; setEditing: (b: boolean) => void; pop: { slot: number; value: string } | null; setPop: (p: { slot: number; value: string } | null) => void }) {
  const s = useStore();
  const [draft, setDraft] = useState(frame.caption);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { setDraft(frame.caption); setNoteOpen(false); setNote(""); }, [frame.id, frame.caption]);

  const roster = derive.roster(s);
  const spans = CaptionParts.split(frame.caption, roster);
  const players = frame.record ? CaptionRecord.correctedVision(frame.record).players : [];
  const matcher = new RosterMatcher(roster, asSport(s.selection.sportID));

  const save = () => {
    const text = draft.replace(/\s*\n+\s*/g, " ").trim();
    if (text) void s.updateCaption(frame.id, text);
    setEditing(false);
  };
  const applyPop = () => {
    if (!pop) return;
    const value = pop.value.trim();
    if (value) void s.assignNumber(frame.id, pop.slot, value);
    setPop(null);
  };
  const state = frame.state === "failed" ? `Failed: ${frame.error}` : frame.state === "working" ? "Captioning…" : frame.state === "pending" ? "Not captioned yet"
    : frame.writeError ? `Not written: ${frame.writeError}` : frame.edited ? "Edited · written to the file" : "Written to the file · IPTC + XMP";

  return (
    <>
      <div className="rail-body">
        <div>
          <Overline style={{ marginBottom: 6 }}>Caption</Overline>
          {!editing ? (
            <div className="caption" onClick={() => setEditing(true)} title="Click to edit — or press e">
              {frame.caption ? spans.map((sp) => (sp.player ? <b key={sp.id} title={sp.team?.name ?? ""}>{sp.text}</b> : <span key={sp.id}>{sp.text}</span>)) : <span className="dim">{frame.state === "pending" ? "Run the captions to fill this in." : "—"}</span>}
            </div>
          ) : (
            <div>
              <TextArea value={draft} autoFocus minHeight={96} onChange={(e) => setDraft(e.target.value)} onBlur={save}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === "Escape") { setDraft(frame.caption); setEditing(false); } }} />
              <div className="editor-hint"><span>⏎ save</span><span>esc cancel</span></div>
            </div>
          )}
        </div>

        <div>
          <Overline style={{ marginBottom: 6 }}>Numbers read</Overline>
          <div className="chips">
            {players.length === 0 && <span className="dim small">none read</span>}
            {players.map((p, slot) => {
              const m = p.jerseyNumber ? matcher.match(p.jerseyNumber, p.jerseyColor, p.action) : null;
              const name = m?.ok ? RosterPlayer.fullName(m.match.player) : null;
              return <KitChip key={slot} number={p.jerseyNumber || "?"} name={name} colour={swatchColour(p.jerseyColor)} flagged={!p.jerseyNumber}
                title={m?.ok && m.match.wasFuzzy ? `Corrected from ${p.jerseyNumber}` : undefined}
                onClick={() => setPop({ slot, value: p.jerseyNumber })} />;
            })}
          </div>
          {pop && (
            <div className="pop">
              <b>Jersey number</b>
              <TextInput mono autoFocus value={pop.value} onChange={(e) => setPop({ ...pop, value: e.target.value })}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") applyPop(); if (e.key === "Escape") setPop(null); }} />
              <p className="note">The caption is rebuilt from the roster — no new request to the model.</p>
              <div className="pop-row"><Button variant="ghost" onClick={() => setPop(null)}>Cancel</Button><Button onClick={applyPop}>Set</Button></div>
            </div>
          )}
        </div>

        {frame.record && (
          <div>
            {!noteOpen ? (
              <button type="button" className="note-open" onClick={() => setNoteOpen(true)}>Tell the model what it missed, then redo…</button>
            ) : (
              <>
                <TextArea value={note} autoFocus minHeight={62} rows={3} placeholder="A change kit, a borrowed number, who is who…" onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { setNoteOpen(false); setNote(""); } }} />
                <div className="redo-row">
                  <Button variant="secondary" disabled={frame.state === "working"} onClick={() => { void s.recaption(frame.id, note); setNoteOpen(false); setNote(""); }}>{frame.state === "working" ? "Captioning…" : note.trim() ? "Redo with this note" : "Redo caption"}</Button>
                  <span className="linky" onClick={() => setNoteOpen(false)}>esc to close</span>
                </div>
              </>
            )}
          </div>
        )}
        {frame.altText && <div><Overline style={{ marginBottom: 6 }}>Alt text</Overline><div className="dim small">{frame.altText}</div></div>}
      </div>
      <div className="rail-foot">
        {frame.approved
          ? <button type="button" className="approve done" onClick={() => void s.setApproved(frame.id, false)}>✓  Approved</button>
          : <button type="button" className="approve" onClick={() => void s.approveAndAdvance()}>Approve and next  ⏎</button>}
        <div className="state">{state}</div>
      </div>
    </>
  );
}

function Filmstrip() {
  const s = useStore();
  const list = derive.visibleFrames(s);
  const current = derive.selected(s)?.id;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }, [current]);
  return (
    <div className="strip" ref={ref}>
      {list.map((f) => <Thumb key={f.id} frame={f} on={f.id === current} />)}
    </div>
  );
}

function Thumb({ frame, on }: { frame: Frame; on: boolean }) {
  const select = useStore((s) => s.select);
  const [url, setUrl] = useState<string | null>(thumbnails.cached(frame.id));
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (url) return;
    const node = el.current;
    if (!node) return;
    let alive = true;
    // Native lazy loading in spirit: a thumbnail is only asked for once it nears the viewport.
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
    <div ref={el} className={"thumb" + (on ? " on" : "") + (frame.approved ? " approved" : "") + (frame.state === "working" ? " working" : "") + (frame.state === "failed" ? " failed" : "")}
      onClick={() => select(frame.id)} title={frame.name}>
      {url ? <img src={url} alt="" /> : null}
      {frame.needsNumber && <span className="thumb-flag">?</span>}
    </div>
  );
}

export { REVIEW_STATUSES, React };
