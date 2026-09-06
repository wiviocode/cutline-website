/**
 * The first-time setup: three steps that collect what the app needs before any photograph is
 * touched. The key is checked against the API before the user may continue, so the first
 * failure they meet is here, with a plain reason, and not in the middle of a shoot.
 */

import React, { useState } from "react";
import { useStore } from "../store";
import { Button, Callout, Field, Mark, RadioCards, Select, Switch, TextInput } from "../components";
import { KeyField } from "./KeyField";
import { TemplatePicker } from "./TemplatePicker";
import { WELCOME_STEPS, firstStep, nextStep, previousStep, type WelcomeStep } from "../onboarding";
import { CAPTION_STYLES, type CaptionStyle } from "@core/caption/CompositionContext";
import { WireStyle } from "@core/caption/WireStyle";
import { SampleCaption } from "@core/caption/SampleCaption";
import { VISION_MODELS, ALT_TEXT_MODES, type AltTextMode } from "@core/anthropic/VisionModel";

export function Welcome() {
  const settings = useStore((s) => s.settings);
  const apiKey = useStore((s) => s.apiKey);
  const [step, setStep] = useState<WelcomeStep>(() => firstStep(settings, apiKey));
  const at = WELCOME_STEPS.findIndex((s) => s.id === step);

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-brand">
          <Mark size={40} />
          <div>
            <h1>Welcome to Cutline.</h1>
            <p>Three short steps, then it is ready for a card of photographs.</p>
          </div>
        </div>
        <ol className="stepper" aria-label="Setup steps">
          {WELCOME_STEPS.map((s, i) => (
            <li key={s.id} className={"st" + (i === at ? " on" : i < at ? " done" : "")} aria-current={i === at ? "step" : undefined}>
              <i aria-hidden="true" />
              <span>{i + 1}. {s.title}</span>
            </li>
          ))}
        </ol>
        {step === "key" && <KeyStep onNext={() => setStep("byline")} />}
        {step === "byline" && <BylineStep onBack={() => setStep(previousStep("byline")!)} onNext={() => setStep(nextStep("byline")!)} />}
        {step === "output" && <OutputStep onBack={() => setStep(previousStep("output")!)} />}
      </div>
    </div>
  );
}

function KeyStep({ onNext }: { onNext: () => void }) {
  const saved = useStore((s) => !!s.apiKey);
  const writable = useStore((s) => s.writableFolders);
  return (
    <section className="wstep" aria-labelledby="w-key">
      <h2 id="w-key">Your Anthropic API key</h2>
      <p className="lede">Cutline reads photographs with a model you pay for directly, so it needs a key of yours. Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.</p>
      <div className="card"><KeyField autoFocus /></div>
      {!writable && (
        <Callout kind="warn">
          <b>This browser can read photographs but cannot write captions into them.</b> Chrome, Edge and Brave can. You can still caption and review here; nothing will be written to the files.
        </Callout>
      )}
      <div className="wnav">
        <span className="spacer" />
        <Button size="lg" disabled={!saved} onClick={onNext} title={saved ? undefined : "Check the key first"}>Continue</Button>
      </div>
    </section>
  );
}

function BylineStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const photographer = useStore((s) => s.settings.photographer);
  const style = useStore((s) => s.settings.style);
  const set = useStore((s) => s.setSetting);
  const name = photographer.trim() || "Your Name";
  return (
    <section className="wstep" aria-labelledby="w-byline">
      <h2 id="w-byline">Your byline and house style</h2>
      <p className="lede">The name goes in the credit line. The style decides how the date, the state and the credit are written — each row shows the same photograph captioned that way.</p>
      <div className="card">
        <Field label="Photographer" hint="As it should appear in the credit: “(AP Photo/Jane Doe)”, “Photo by Jane Doe/Getty Images”.">
          <TextInput value={photographer} placeholder="Jane Doe" autoFocus onChange={(e) => set({ photographer: e.target.value })} ariaLabel="Photographer" />
        </Field>
      </div>
      <RadioCards<CaptionStyle> name="style" value={style} onChange={(v) => set({ style: v })}
        options={CAPTION_STYLES.map((st) => ({ id: st, title: WireStyle.displayName(st), detail: <span className="sample">{SampleCaption.text(st, name)}</span> }))} />
      <div className="wnav">
        <Button variant="ghost" size="lg" onClick={onBack}>Back</Button>
        <span className="spacer" />
        <Button size="lg" onClick={onNext}>Continue</Button>
      </div>
    </section>
  );
}

function OutputStep({ onBack }: { onBack: () => void }) {
  const settings = useStore((s) => s.settings);
  const writable = useStore((s) => s.writableFolders);
  const set = useStore((s) => s.setSetting);
  const finish = useStore((s) => s.finishOnboarding);
  return (
    <section className="wstep" aria-labelledby="w-output">
      <h2 id="w-output">Model and output</h2>
      <p className="lede">Reading a jersey number off a moving player is the hardest thing this asks of a model. Everything here can be changed later in Settings.</p>
      <RadioCards name="model" value={settings.model} onChange={(v) => set({ model: v })}
        options={VISION_MODELS.map((m) => ({
          id: m.id, title: m.name, aside: `$${m.inputPricePerMillion} in · $${m.outputPricePerMillion} out, per million tokens`,
          detail: m.relativeCost === "most capable" ? "Reads the most numbers right. The default."
            : m.relativeCost === "balanced" ? "Most of the accuracy at less than half the price."
            : "Cheapest and quickest; misses more numbers on busy frames.",
        }))} />
      <div className="card rows">
        <div className="row">
          <span className="k">Write captions into the photographs<small>{writable ? "Only the metadata is replaced; the image itself is untouched. Raw files and PNGs get a sidecar." : "This browser cannot write to files on disk. Use Chrome, Edge or Brave for that."}</small></span>
          <span className="c"><Switch on={settings.embedInFile && writable} disabled={!writable} onChange={(v) => set({ embedInFile: v })} ariaLabel="Write captions into the photographs" /></span>
        </div>
        <div className="row">
          <span className="k">Alt text<small>A sentence for screen readers, written into the file with the caption. Simple is built from the caption and costs nothing.</small></span>
          <span className="c"><Select<AltTextMode> value={settings.altTextMode} options={ALT_TEXT_MODES.map((m) => ({ id: m.id, name: m.name }))} onChange={(v) => set({ altTextMode: v })} ariaLabel="Alt text" /></span>
        </div>
      </div>
      <div className="card">
        <div className="field">
          <span className="field-label">Your desk's IPTC template</span>
          <div className="keyrow" style={{ flexWrap: "wrap", justifyContent: "flex-start" }}><TemplatePicker /></div>
          <span className="field-hint">Optional. A .XMP stationery pad exported from Photo Mechanic carries the standing fields the app cannot know — credit line, copyright, source, contact — and every frame gets them. Without one, the caption, capture date, By-line, headline, place and category codes are still written into each photograph.</span>
        </div>
      </div>
      <div className="wnav">
        <Button variant="ghost" size="lg" onClick={onBack}>Back</Button>
        <span className="spacer" />
        <Button size="lg" onClick={finish}>Finish setup</Button>
      </div>
    </section>
  );
}

export { React };
