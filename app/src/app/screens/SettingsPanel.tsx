/**
 * Settings: the same values, in the same groups, as the native app. The saved API key is never
 * read back out and put on screen — the page is told only whether a key exists.
 */

import React, { useRef, useState } from "react";
import { useStore, derive } from "../store";
import { Button, Select, Switch, TextInput } from "../components";
import { CAPTION_STYLES } from "@core/caption/CompositionContext";
import { WireStyle } from "@core/caption/WireStyle";
import { SampleCaption } from "@core/caption/SampleCaption";
import { VISION_MODELS, ALT_TEXT_MODES, ImagePrep } from "@core/anthropic/VisionModel";
import { NamingPattern } from "@core/naming/NamingPattern";
import { HDSNaming } from "@core/naming/HDSNaming";
import { localDate } from "@core/images/PhotoMetadata";

type Tab = "captions" | "model" | "output";

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [tab, setTab] = useState<Tab>("captions");
  const [key, setKey] = useState("");
  const [why, setWhy] = useState<Record<string, boolean>>({});
  const tplInput = useRef<HTMLInputElement>(null);
  const set = s.setSetting;
  const toggle = (id: string) => setWhy((w) => ({ ...w, [id]: !w[id] }));
  const Why = ({ id }: { id: string }) => <button type="button" className={"why" + (why[id] ? " on" : "")} onClick={() => toggle(id)}>i</button>;

  const sample = SampleCaption.text(s.settings.style, s.settings.photographer);
  const namingExample = NamingPattern.filename(s.settings.namingPattern, { initials: HDSNaming.initials(s.settings.photographer) || "EL", date: localDate(2024, 9, 14), sportCode: "FB", covered: "Nebraska", opponent: "Ohio State", coveredIsHome: true }, 1, "jpg");
  const unknown = NamingPattern.unknownTokens(s.settings.namingPattern);
  const altCost: Record<string, string> = { brief: "A second look at a small copy of each photo, about $0.45 per 500 frames.", detailed: "A second look at each photo, about $1 per 500 frames." };

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-label="Settings" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <header className="sheet-head"><h1>Settings</h1><span className="spacer" /><Button onClick={onClose}>Done</Button></header>
        <nav className="tabs">
          {(["captions", "model", "output"] as Tab[]).map((t) => <button type="button" key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "captions" ? "Captions" : t === "model" ? "Model" : "Output"}</button>)}
        </nav>
        <div className="sheet-body">
          {tab === "captions" && (
            <section>
              <h2>Caption style</h2>
              <div className="card">
                <div className="row"><span className="k">House style</span><span className="c"><Select value={s.settings.style} options={CAPTION_STYLES.map((st) => ({ id: st, name: WireStyle.displayName(st) }))} onChange={(v) => set({ style: v })} /></span></div>
                <div className="row"><span className="k">Photographer</span><span className="c" style={{ width: 230 }}><TextInput value={s.settings.photographer} placeholder="for “Photo by …”" onChange={(e) => set({ photographer: e.target.value })} /></span></div>
                {s.settings.style === "hurrdatSports" && !s.settings.photographer && <p className="note">Without a photographer the caption ends at the location, with no credit line.</p>}
                <div className="example"><span className="ex-label">Example</span><p>{sample}</p></div>
              </div>
            </section>
          )}
          {tab === "model" && (
            <>
              <section>
                <h2>Quality and speed</h2>
                <div className="card">
                  <div className="row"><span className="k">Model<Why id="model" /></span><span className="c"><Select value={s.settings.model} options={VISION_MODELS.map((m) => ({ id: m.id, name: `${m.name} — ${m.relativeCost}` }))} onChange={(v) => set({ model: v })} /></span></div>
                  {why.model && <p className="note">Reading a jersey number off a moving player is the hardest thing this asks of a model.</p>}
                  <div className="row"><span className="k">Detail sent to the model<Why id="detail" /></span><span className="c"><Select value={String(s.settings.longEdge)} options={ImagePrep.longEdges.map((e) => ({ id: String(e.id), name: e.name }))} onChange={(v) => set({ longEdge: Number(v) })} /></span></div>
                  {why.detail && <p className="note">Maximum costs about $9 more per 500 frames on Opus, and reads numbers Balanced sometimes misses.</p>}
                  <div className="row"><span className="k">Photos at once</span><span className="c"><input type="range" min={1} max={10} step={1} value={s.settings.concurrency} onChange={(e) => set({ concurrency: Number(e.target.value) })} /><span className="count">{s.settings.concurrency}</span></span></div>
                </div>
              </section>
              <section>
                <h2>Anthropic API key</h2>
                <div className="card">
                  <div className="row"><span className="k">Key<Why id="key" /></span><span className="c"><TextInput type="password" value={key} placeholder="sk-ant-…" style={{ width: 230 }} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && key.trim()) { void s.setApiKey(key); setKey(""); } }} /><Button disabled={!key.trim()} onClick={() => { void s.setApiKey(key); setKey(""); }}>Save</Button></span></div>
                  <div className="row"><span className={"k " + (s.apiKey ? "saved" : "dim")}>{s.apiKey ? "A key is saved" : "No key saved"}</span><span className="c"><Button variant="ghost" disabled={!s.apiKey} onClick={() => void s.setApiKey("")}>Remove</Button></span></div>
                  {why.key && <p className="note">Kept in this browser's own storage and never shown back here. Unlike the Mac app's keychain, anything else running in this browser profile could read it — use a key you can revoke.</p>}
                </div>
              </section>
            </>
          )}
          {tab === "output" && (
            <>
              <section>
                <h2>What gets written</h2>
                <div className="card">
                  <div className="row"><span className="k">Write metadata into the photographs<Why id="embed" /></span><span className="c"><Switch on={s.settings.embedInFile} onChange={(v) => set({ embedInFile: v })} disabled={!s.writableFolders} /></span></div>
                  {why.embed && <p className="note">Only the metadata is replaced — the image itself is untouched. Raw files and PNGs get a sidecar, which is the only place their metadata can go.</p>}
                  {!s.writableFolders && <p className="note warn-text">This browser cannot write to files on disk. Use Chrome or Edge for that.</p>}
                  <div className="row"><span className="k">Also write .xmp sidecars</span><span className="c"><Switch on={s.settings.writeSidecars} onChange={(v) => set({ writeSidecars: v })} /></span></div>
                  <div className="row"><span className="k">Alt text</span><span className="c"><Select value={s.settings.altTextMode} options={ALT_TEXT_MODES.map((m) => ({ id: m.id, name: m.name }))} onChange={(v) => set({ altTextMode: v })} /></span></div>
                  {altCost[s.settings.altTextMode] && <p className="note">{altCost[s.settings.altTextMode]}</p>}
                  <div className="row">
                    <span className="k">IPTC template<Why id="tpl" /></span>
                    <span className="c">
                      <Select value={s.settings.templateName ?? ""} options={[{ id: "", name: "none" }, ...s.templateNames.map((n) => ({ id: n, name: n }))]} onChange={(v) => set({ templateName: v || null })} />
                      <Button variant="secondary" onClick={() => tplInput.current?.click()}>Add…</Button>
                      {s.settings.templateName && <button type="button" className="linky" onClick={() => void s.removeTemplate(s.settings.templateName!)}>Remove</button>}
                      <input ref={tplInput} type="file" accept=".xmp,.XMP,text/xml,application/xml" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) await s.addTemplate(f.name, await f.text()); e.target.value = ""; }} />
                    </span>
                  </div>
                  {why.tpl && <p className="note">Your desk's standing credit, copyright and source, exported from Photo Mechanic as a .XMP stationery pad. The descriptor, sport code and venue are filled in per shoot and written over it.</p>}
                </div>
              </section>
              <section>
                <h2>File names</h2>
                <div className="card">
                  <div className="row stacked"><span className="k">Pattern<Why id="tokens" /></span><TextInput mono spellCheck={false} value={s.settings.namingPattern} onChange={(e) => set({ namingPattern: e.target.value })} /></div>
                  {why.tokens && <p className="note tokens">{NamingPattern.tokens.map((t) => <span key={t.token}><code>{t.token}</code> {t.meaning} · </span>)}</p>}
                  <div className="example"><span className="ex-label">Example</span><p className="mono">{namingExample}</p></div>
                  {unknown.length > 0 && <p className="note problem">Not a token this app knows: {unknown.join(", ")} — it will appear in the filename exactly as written.</p>}
                  <div className="row"><span className="k">Start again</span><span className="c"><Button variant="secondary" disabled={s.settings.namingPattern === NamingPattern.hurrdat} onClick={() => set({ namingPattern: NamingPattern.hurrdat })}>Hurrdat default</Button></span></div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export { derive, React };
