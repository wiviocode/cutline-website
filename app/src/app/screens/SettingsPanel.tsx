/**
 * Settings: one scrolling sheet, sections in the order a person needs them. Every explanation
 * sits under its control, always visible, one line. The saved key is never shown back.
 */

import React from "react";
import { useStore } from "../store";
import { Button, Overline, Select, Sheet, Switch, TextInput } from "../components";
import { KeyField } from "./KeyField";
import { TemplatePicker } from "./TemplatePicker";
import { NamingPicker } from "./NamingPicker";
import { CAPTION_STYLES, type CaptionStyle } from "@core/caption/CompositionContext";
import { WireStyle } from "@core/caption/WireStyle";
import { SampleCaption } from "@core/caption/SampleCaption";
import { VISION_MODELS, ALT_TEXT_MODES, ImagePrep, type AltTextMode } from "@core/anthropic/VisionModel";

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.setSetting);
  const writable = useStore((s) => s.writableFolders);
  const reopenSetup = useStore((s) => s.reopenSetup);

  const sample = SampleCaption.text(settings.style, settings.photographer.trim() || "Your Name", settings.house);
  const altCost: Partial<Record<AltTextMode, string>> = { brief: "A second look at a small copy of each photo, about $0.45 per 500 frames.", detailed: "A second look at each photo, about $1 per 500 frames." };

  return (
    <Sheet title="Settings" onClose={onClose} footer={<><span className="spacer" /><Button onClick={onClose}>Done</Button></>}>
      <section className="section">
        <div className="section-head"><Overline>Anthropic API key</Overline></div>
        <div className="card"><KeyField /></div>
      </section>

      <section className="section">
        <div className="section-head"><Overline>Byline and house style</Overline></div>
        <div className="card rows">
          <div className="row">
            <span className="k">Photographer<small>As it should appear in the credit line.</small></span>
            <span className="c"><TextInput value={settings.photographer} placeholder="Jane Doe" style={{ width: 220 }} onChange={(e) => set({ photographer: e.target.value })} ariaLabel="Photographer" /></span>
          </div>
          <div className="row">
            <span className="k">House<small>The agency, desk or publication in the credit line. Blank uses the style's own{WireStyle.defaultHouse(settings.style) ? `: ${WireStyle.defaultHouse(settings.style)}` : ""}.</small></span>
            <span className="c"><TextInput value={settings.house} placeholder={WireStyle.defaultHouse(settings.style) ?? "Hurrdat Sports"} style={{ width: 220 }} onChange={(e) => set({ house: e.target.value })} ariaLabel="House" /></span>
          </div>
          <div className="row">
            <span className="k">House style<small>How the date, the state and the credit are written.</small></span>
            <span className="c"><Select<CaptionStyle> value={settings.style} options={CAPTION_STYLES.map((st) => ({ id: st, name: WireStyle.displayName(st) }))} onChange={(v) => set({ style: v })} ariaLabel="House style" /></span>
          </div>
          {settings.style === "hurrdatSports" && !settings.photographer && <p className="note problem">Without a photographer the caption ends at the location, with no credit line.</p>}
          <div className="example"><Overline style={{ marginBottom: 6 }}>Example</Overline><p className="sample">{sample}</p></div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><Overline>Model</Overline></div>
        <div className="card rows">
          <div className="row">
            <span className="k">Model<small>Reading a jersey number off a moving player is the hardest thing this asks of a model.</small></span>
            <span className="c"><Select value={settings.model} options={VISION_MODELS.map((m) => ({ id: m.id, name: `${m.name} — ${m.relativeCost}` }))} onChange={(v) => set({ model: v })} ariaLabel="Model" /></span>
          </div>
          <div className="row">
            <span className="k">Detail sent to the model<small>Maximum reads numbers Balanced sometimes misses, at about two and a half times the image cost.</small></span>
            <span className="c"><Select value={String(settings.longEdge)} options={ImagePrep.longEdges.map((e) => ({ id: String(e.id), name: e.name }))} onChange={(v) => set({ longEdge: Number(v) })} ariaLabel="Detail" /></span>
          </div>
          <div className="row">
            <span className="k">Photographs at once<small>More is faster until the rate limit; the run waits and retries on its own.</small></span>
            <span className="c"><input type="range" min={1} max={10} step={1} value={settings.concurrency} aria-label="Photographs at once" onChange={(e) => set({ concurrency: Number(e.target.value) })} /><span className="count mono">{settings.concurrency}</span></span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><Overline>What gets written</Overline></div>
        <div className="card rows">
          <div className="row">
            <span className="k">Write captions into the photographs<small>{writable ? "Only the metadata is replaced; the image itself is untouched. Raw files and PNGs get a sidecar, the only place their metadata can go." : "This browser cannot write to files on disk. Chrome, Edge and Brave can."}</small></span>
            <span className="c"><Switch on={settings.embedInFile && writable} disabled={!writable} onChange={(v) => set({ embedInFile: v })} ariaLabel="Write captions into the photographs" /></span>
          </div>
          <div className="row">
            <span className="k">Also write .xmp sidecars<small>Off by default: a sidecar beside a JPEG goes stale the moment anything else writes the file.</small></span>
            <span className="c"><Switch on={settings.writeSidecars} onChange={(v) => set({ writeSidecars: v })} ariaLabel="Write sidecars" /></span>
          </div>
          <div className="row">
            <span className="k">Alt text<small>{altCost[settings.altTextMode] ?? "A sentence for screen readers, written with the caption. Simple is built from the caption and costs nothing."}</small></span>
            <span className="c"><Select<AltTextMode> value={settings.altTextMode} options={ALT_TEXT_MODES.map((m) => ({ id: m.id, name: m.name }))} onChange={(v) => set({ altTextMode: v })} ariaLabel="Alt text" /></span>
          </div>
          <div className="row">
            <span className="k">IPTC template<small>Your desk's standing credit, copyright and source — made here, or exported from Photo Mechanic as a .XMP stationery pad. The per-shoot fields are written over it; without one the caption, date, By-line, headline, place and codes are still written.</small></span>
            <span className="c"><TemplatePicker /></span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><Overline>File names</Overline><span className="hint">Used by Rename photos… on the review screen.</span></div>
        <div className="card"><NamingPicker /></div>
      </section>

      <section className="section">
        <div className="section-head"><Overline>Setup</Overline></div>
        <div className="card rows">
          <div className="row">
            <span className="k">First-time setup<small>Walk through the key, byline and house, model, output and file names again.</small></span>
            <span className="c"><Button variant="secondary" onClick={reopenSetup}>Run it again</Button></span>
          </div>
        </div>
      </section>
    </Sheet>
  );
}

export { React };
