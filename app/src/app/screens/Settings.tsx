import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { Button, Field, Modal, Segmented, Select, TextInput, Spinner } from "../components";
import { CAPTION_STYLES, Styles, type CaptionStyle } from "@core/caption/Styles";
import { TIERS, Cost, type Tier } from "@core/ai/Models";
import { Storage } from "@platform/storage";
import { IPTCTemplate } from "@core/metadata/IPTCTemplate";

export function SettingsPanel() {
  const s = useStore();
  const [key, setKey] = useState("");
  const [templates, setTemplates] = useState<string[]>([]);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { void Storage.templateNames().then(setTemplates); }, []);
  const set = s.updateSettings;

  const addTemplate = async (f: File) => {
    const text = await f.text();
    try { new IPTCTemplate(text); } catch { s.notify("That file is not an XMP template Cutline can read."); return; }
    const name = f.name.replace(/\.[^.]+$/, "");
    await Storage.saveTemplate(name, text);
    setTemplates(await Storage.templateNames());
    await set({ templateName: name });
  };

  return (
    <Modal title="Settings" onClose={() => s.setPanel(null)} wide>
      <div className="settings">
        <section>
          <h3>Anthropic API key</h3>
          <p className="muted small">{s.apiKey ? `A key ending …${s.apiKey.slice(-4)} is saved in this browser.` : "No key saved."} It is sent only to api.anthropic.com. Anything else running in this browser profile could read it — use a key you can revoke. </p>
          <div className="row">
            <TextInput type="password" placeholder="sk-ant-… to replace it" value={key} onChange={(e) => setKey(e.target.value)} />
            <Button onClick={async () => { if (await s.saveKey(key)) setKey(""); }} disabled={!key.trim() || s.keyStatus === "checking"}>{s.keyStatus === "checking" ? <Spinner /> : "Check and save"}</Button>
          </div>
          {s.keyStatus === "bad" && s.keyError ? <p className="error small">{s.keyError}</p> : null}
        </section>

        <section>
          <h3>Byline and style</h3>
          <div className="grid-2">
            <Field label="Your name"><TextInput value={s.settings.photographer} onChange={(e) => set({ photographer: e.target.value })} /></Field>
            <Field label="Credit to" hint={`Blank for "${Styles.defaultHouse(s.settings.style) ?? "none"}"`}><TextInput value={s.settings.house} onChange={(e) => set({ house: e.target.value })} /></Field>
            <Field label="House style"><Select<CaptionStyle> value={s.settings.style} onChange={(v) => set({ style: v })} options={CAPTION_STYLES.map((v) => ({ value: v, label: Styles.displayName(v) }))} /></Field>
            <Field label="A player who can't be named">
              <Segmented value={s.settings.unnamed} onChange={(v) => set({ unnamed: v })} options={[{ value: "placeholder", label: "XXXXX" }, { value: "describe", label: "“a Nebraska player”" }]} />
            </Field>
          </div>
        </section>

        <section>
          <h3>Reading</h3>
          <Field label="Accuracy and cost">
            <Segmented<Tier> value={s.settings.tier} onChange={(v) => set({ tier: v })} options={(["economy", "balanced", "best"] as Tier[]).map((t) => ({ value: t, label: `${TIERS[t].name} · ${Cost.dollars(Cost.perPhoto(t) * 1000)}/1k` }))} />
          </Field>
          <p className="muted small">{TIERS[s.settings.tier].blurb}</p>
          <div className="grid-2">
            <Field label="Photographs at once" hint="More is faster; lower it if Anthropic rate-limits your key.">
              <Select value={String(s.settings.concurrency)} onChange={(v) => set({ concurrency: Number(v) })} options={["2", "4", "6", "8"].map((v) => ({ value: v, label: v }))} />
            </Field>
            <Field label="Face matching" hint="On-device only, never sent anywhere. Offered for college rosters with headshots; off for high school, whose athletes are mostly minors.">
              <Segmented value={s.settings.faces ? "on" : "off"} onChange={(v) => set({ faces: v === "on" })} options={[{ value: "off", label: "Off" }, { value: "on", label: "College only" }]} />
            </Field>
          </div>
        </section>

        <section>
          <h3>Writing</h3>
          <div className="grid-2">
            <Field label="Where captions go">
              <Segmented value={s.settings.embed ? "embed" : "sidecar"} onChange={(v) => set({ embed: v === "embed" })} options={[{ value: "embed", label: "Into the JPEG" }, { value: "sidecar", label: ".xmp sidecars" }]} />
            </Field>
            <Field label="IPTC template" hint="A Photo Mechanic stationery pad (.XMP): credit, copyright, contact and the rest, on every frame.">
              <div className="row">
                <Select value={s.settings.templateName ?? ""} onChange={(v) => set({ templateName: v || null })} options={[{ value: "", label: "None" }, ...templates.map((t) => ({ value: t, label: t }))]} />
                <Button small onClick={() => file.current?.click()}>Add</Button>
                <input ref={file} type="file" hidden accept=".xmp,.XMP,.xml" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addTemplate(f); e.target.value = ""; }} />
              </div>
            </Field>
          </div>
        </section>
      </div>
    </Modal>
  );
}
