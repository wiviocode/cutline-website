/**
 * A provider's API key, entered and checked in one place — the same control on the welcome
 * screen and in Settings. The key is never read back out of storage onto the screen; the page
 * only knows whether one is saved.
 */

import React, { useState } from "react";
import { useStore } from "../store";
import { Button, Field, TextInput } from "../components";
import { keyProblem } from "../onboarding";
import { Providers, type KeyedProviderID } from "@core/models/Providers";
import { Article } from "@core/caption/Article";

export function KeyField({ provider = "anthropic", autoFocus = false, onSaved }: { provider?: KeyedProviderID; autoFocus?: boolean; onSaved?: () => void }) {
  const saved = useStore((s) => !!s.keys[provider]);
  const verifyKey = useStore((s) => s.verifyKey);
  const setKey = useStore((s) => s.setKey);
  const [key, setKeyText] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const info = Providers.info(provider);

  const check = async () => {
    const problem = keyProblem(key, provider);
    if (problem) { setResult({ ok: false, text: problem }); return; }
    setChecking(true); setResult(null);
    const r = await verifyKey(provider, key);
    setChecking(false);
    if (r.ok) { await setKey(provider, key); setKeyText(""); setResult({ ok: true, text: "The key works and is saved in this browser." }); onSaved?.(); }
    else setResult({ ok: false, text: r.reason });
  };

  const remove = async () => { await setKey(provider, ""); setResult(null); setKeyText(""); };

  return (
    <div className="stack" key={provider}>
      <Field label={saved ? `Replace the saved ${info.name} key` : `${info.name} API key`}
        hint={<>Kept in this browser, on this site only, and sent to nothing but {info.destination}. Anything else running in this browser profile could read it, so use a key you can revoke.{info.keyURL && <> Get one at <a href={info.keyURL} target="_blank" rel="noreferrer">{new URL(info.keyURL).host}</a>.</>}</>}>
        <div className="keyrow">
          <TextInput type="password" value={key} placeholder={`${info.keyPrefix ?? ""}…`} autoFocus={autoFocus && !saved} spellCheck={false} ariaLabel={`${info.name} API key`}
            onChange={(e) => { setKeyText(e.target.value); setResult(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && key.trim() && !checking) void check(); }} />
          <Button variant={saved ? "secondary" : "primary"} disabled={checking || !key.trim()} onClick={() => void check()}>{checking ? "Checking…" : "Check and save"}</Button>
        </div>
      </Field>
      <div className={"keystate" + (result ? (result.ok ? " ok" : " bad") : "")} role="status" aria-live="polite">
        {result ? <>{result.ok ? "✓" : "!"} {result.text}</>
          : saved ? <><span className="saved">✓ {Article.leading(info.name)} {info.name} key is saved in this browser.</span><button type="button" className="linky" onClick={() => void remove()}>Remove it</button></>
          : <span className="dim">No {info.name} key saved yet.</span>}
      </div>
    </div>
  );
}

export { React };
