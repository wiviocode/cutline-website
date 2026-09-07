/**
 * A model on this Mac: where its server answers, which of the models pulled there to use, and
 * the two things a photographer has to do once so a web page may talk to it.
 */

import React, { useState } from "react";
import { useStore } from "../store";
import { Button, Callout, Field, Select, TextInput } from "../components";
import { DEFAULT_LOCAL_BASE_URL } from "@core/models/VisionClient";

export function LocalModelSetup() {
  const baseURL = useStore((s) => s.settings.localBaseURL);
  const chosen = useStore((s) => s.settings.localModel);
  const set = useStore((s) => s.setSetting);
  const probe = useStore((s) => s.probeLocal);
  const choose = useStore((s) => s.chooseLocalModel);
  const [models, setModels] = useState<string[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const origin = typeof location !== "undefined" ? location.origin : "https://cutline.photo";

  const look = async () => {
    setLooking(true); setProblem(null);
    const r = await probe(baseURL || DEFAULT_LOCAL_BASE_URL);
    setLooking(false);
    if (!r.ok) { setModels(null); setProblem(r.reason); return; }
    setModels(r.models);
    if (!r.models.length) setProblem("The server answered but has no models. Pull one first — see below.");
    else if (!r.models.includes(chosen)) choose(r.models.find((m) => /vl|vision|llava|gemma3|pixtral/i.test(m)) ?? r.models[0]);
  };

  const options = (models ?? (chosen ? [chosen] : [])).map((m) => ({ id: m, name: m }));

  return (
    <div className="stack">
      <Field label="Model server" hint="Ollama answers at localhost:11434; LM Studio at localhost:1234. Both take no key.">
        <div className="keyrow">
          <TextInput value={baseURL} mono placeholder={DEFAULT_LOCAL_BASE_URL} spellCheck={false} ariaLabel="Model server address" onChange={(e) => set({ localBaseURL: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && !looking) void look(); }} />
          <Button variant={chosen ? "secondary" : "primary"} disabled={looking} onClick={() => void look()}>{looking ? "Looking…" : "Look for models"}</Button>
        </div>
      </Field>
      {options.length > 0 && (
        <Field label="Model" hint="A vision model — one that takes an image. Listed as the server has them.">
          <Select value={chosen} options={options} placeholder="Choose a model…" onChange={(v) => choose(v)} ariaLabel="Model on this Mac" />
        </Field>
      )}
      <div className={"keystate" + (problem ? " bad" : chosen ? " ok" : "")} role="status" aria-live="polite">
        {problem ? <>! {problem}</> : chosen ? <>✓ {chosen} will read the photographs, on this Mac.</> : <span className="dim">No model chosen yet.</span>}
      </div>
      <Callout kind="note">
        <b>Setting it up once, with Ollama.</b>
        <ol className="steps">
          <li>Install Ollama from <a href="https://ollama.com" target="_blank" rel="noreferrer">ollama.com</a>, then pull a vision model in Terminal: <code className="cmd">ollama pull qwen3-vl:8b</code></li>
          <li>Let this site talk to it: <code className="cmd">launchctl setenv OLLAMA_ORIGINS "{origin}"</code> — then quit Ollama from the menu bar and open it again.</li>
          <li>Come back here and press <b>Look for models</b>. If the browser asks whether this site may reach devices on your local network, allow it.</li>
        </ol>
        <span className="dim">LM Studio instead: start its server, turn on CORS in the server settings, and use <code className="cmd">http://localhost:1234/v1</code> above.</span>
      </Callout>
    </div>
  );
}

export { React };
