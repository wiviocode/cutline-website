/**
 * The API key, entered and checked in one place — the same control on the welcome screen and in
 * Settings. The key is never read back out of storage onto the screen; the page only knows
 * whether one is saved.
 */

import React, { useState } from "react";
import { useStore } from "../store";
import { Button, Field, TextInput } from "../components";
import { keyProblem } from "../onboarding";

export function KeyField({ autoFocus = false, onSaved }: { autoFocus?: boolean; onSaved?: () => void }) {
  const apiKey = useStore((s) => s.apiKey);
  const verifyKey = useStore((s) => s.verifyKey);
  const setApiKey = useStore((s) => s.setApiKey);
  const [key, setKey] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const saved = !!apiKey;

  const check = async () => {
    const problem = keyProblem(key);
    if (problem) { setResult({ ok: false, text: problem }); return; }
    setChecking(true); setResult(null);
    const r = await verifyKey(key);
    setChecking(false);
    if (r.ok) { await setApiKey(key); setKey(""); setResult({ ok: true, text: "The key works and is saved in this browser." }); onSaved?.(); }
    else setResult({ ok: false, text: r.reason });
  };

  const remove = async () => { await setApiKey(""); setResult(null); setKey(""); };

  return (
    <div className="stack">
      <Field label={saved ? "Replace the saved key" : "API key"}
        hint="Kept in this browser, on this site only, and sent to nothing but api.anthropic.com. Anything else running in this browser profile could read it, so use a key you can revoke.">
        <div className="keyrow">
          <TextInput type="password" value={key} placeholder="sk-ant-…" autoFocus={autoFocus && !saved} spellCheck={false} ariaLabel="API key"
            onChange={(e) => { setKey(e.target.value); setResult(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && key.trim() && !checking) void check(); }} />
          <Button variant={saved ? "secondary" : "primary"} disabled={checking || !key.trim()} onClick={() => void check()}>{checking ? "Checking…" : "Check and save"}</Button>
        </div>
      </Field>
      <div className={"keystate" + (result ? (result.ok ? " ok" : " bad") : "")} role="status" aria-live="polite">
        {result ? <>{result.ok ? "✓" : "!"} {result.text}</>
          : saved ? <><span className="saved">✓ A key is saved in this browser.</span><button type="button" className="linky" onClick={() => void remove()}>Remove it</button></>
          : <span className="dim">No key saved yet.</span>}
      </div>
    </div>
  );
}

export { React };
