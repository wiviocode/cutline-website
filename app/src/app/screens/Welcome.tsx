import { useState } from "react";
import { useStore } from "../store";
import { Button, Field, Mark, Segmented, Select, TextInput, Spinner } from "../components";
import { CAPTION_STYLES, Styles, type CaptionStyle } from "@core/caption/Styles";
import { TemplateBuilder } from "@core/metadata/TemplateBuilder";
import { Storage } from "@platform/storage";
import { TemplateForm, draftTemplate, type TemplateDraft } from "./TemplateForm";

export function Welcome() {
  const s = useStore();
  const [key, setKey] = useState("");
  const [name, setName] = useState(s.settings.photographer);
  const [house, setHouse] = useState(s.settings.house);
  const [style, setStyle] = useState<CaptionStyle>(s.settings.style);
  // A key already saved counts; one typed over it has to be checked first.
  const ok = s.keyStatus === "ok" && !!s.apiKey && (!key.trim() || key.trim() === s.apiKey);
  const [wantTemplate, setWantTemplate] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const templateReady = !wantTemplate || (!!draft?.name.trim() && TemplateBuilder.hasContent(draft.fields));

  const finish = async () => {
    await s.updateSettings({ photographer: name.trim(), house: house.trim(), style });
    if (wantTemplate && draft && templateReady) {
      await Storage.saveTemplate(draft.name.trim(), TemplateBuilder.build(draft.fields));
      await s.updateSettings({ templateName: draft.name.trim() });
    }
    await s.finishWelcome();
  };

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-head"><Mark size={34} /><h1>Cutline</h1></div>
        <p className="lede">Captions for sports photographs. Drop in a folder, add the two rosters, and Cutline reads every frame, names the players by jersey number, writes the caption in your desk's style and files it into the photograph.</p>

        <section className="welcome-step">
          <h2><span className="step-n">1</span> Your Anthropic API key</h2>
          <p className="muted">Photographs go from this browser straight to Anthropic and nowhere else. The key is kept in this browser only. <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Get a key</a></p>
          <div className="row">
            <TextInput type="password" placeholder={s.apiKey ? `Saved key …${s.apiKey.slice(-4)}` : "sk-ant-…"} value={key} onChange={(e) => setKey(e.target.value)} aria-label="Anthropic API key" />
            <Button kind={ok ? "secondary" : "primary"} onClick={() => s.saveKey(key)} disabled={!key.trim() || s.keyStatus === "checking"}>
              {s.keyStatus === "checking" ? <Spinner /> : ok ? "Checked" : "Check key"}
            </Button>
          </div>
          {s.keyStatus === "bad" && s.keyError ? <p className="error">{s.keyError}</p> : null}
          {ok ? <p className="ok">The key works.</p> : null}
        </section>

        <section className="welcome-step">
          <h2><span className="step-n">2</span> Your byline and house style</h2>
          <div className="grid-2">
            <Field label="Your name, as credited"><TextInput placeholder="Eli Larson" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Credit to" hint={`Blank for "${Styles.defaultHouse(style) ?? "no house"}"`}><TextInput placeholder={Styles.defaultHouse(style) ?? "Nebraska Athletics"} value={house} onChange={(e) => setHouse(e.target.value)} /></Field>
            <Field label="House style" wide>
              <Select value={style} onChange={setStyle} options={CAPTION_STYLES.map((v) => ({ value: v, label: Styles.displayName(v) }))} />
            </Field>
          </div>
          <p className="sample">{sample(style, name || "Eli Larson", house)}</p>
        </section>

        <section className="welcome-step">
          <h2><span className="step-n">3</span> An IPTC template <span className="muted small">optional</span></h2>
          <p className="muted">Credit, copyright and contact fields written into every photograph with the caption — what a Photo Mechanic stationery pad holds. You can also make one or load a .XMP pad later in Settings.</p>
          <Segmented value={wantTemplate ? "make" : "skip"} onChange={(v) => { setWantTemplate(v === "make"); if (v === "make" && !draft) setDraft(draftTemplate(name.trim(), house.trim())); }}
            options={[{ value: "skip", label: "Not now" }, { value: "make", label: "Make one" }]} />
          {wantTemplate && draft ? <TemplateForm draft={draft} onChange={setDraft} /> : null}
        </section>

        <div className="welcome-foot">
          {wantTemplate && !templateReady ? <span className="muted small">Give the template a name and at least one field, or choose Not now.</span> : null}
          <Button kind="primary" onClick={finish} disabled={!ok || !name.trim() || !templateReady}>Start</Button>
        </div>
      </div>
    </div>
  );
}

function sample(style: CaptionStyle, name: string, house: string): string {
  const credit = Styles.creditLine(style, name, house) ?? "";
  switch (style) {
    case "hurrdatSports": return `Waverly Viking Gracie Lauenstein (3) digs the ball against the Gretna Dragons during a high school volleyball match, Thursday, Sept. 24, 2026, at Waverly High School Gymnasium in Waverly, Neb. ${credit}`;
    case "gettySports": case "gettySportsParen": case "iconSports":
      return `Andi Jackson ${style === "gettySportsParen" ? "(15)" : "#15"} of the Nebraska Cornhuskers spikes the ball during a college volleyball match against the North Carolina Tar Heels at Bob Devaney Sports Center on September 18, 2026 in Lincoln, Nebraska. ${credit}`;
    case "imagnImages": return `Sep 18, 2026; Lincoln, NE, USA; Nebraska Cornhuskers middle blocker Andi Jackson (15) spikes the ball during a college volleyball match against the North Carolina Tar Heels at Bob Devaney Sports Center. ${credit}`;
    case "simple": return "Andi Jackson (15) spikes the ball during a college volleyball match against North Carolina, Sept. 18, 2026, in Lincoln, Neb.";
    default: return `Nebraska middle blocker Andi Jackson (15) spikes the ball during an NCAA college volleyball match against North Carolina, Friday, Sept. 18, 2026, in Lincoln, Neb. ${credit}`;
  }
}
