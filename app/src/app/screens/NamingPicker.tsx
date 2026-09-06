/**
 * How the renamer names photographs: a convention picked from a short list, or a pattern typed
 * from the tokens, with the result shown as it is typed. One control in the first-time setup and
 * in Settings. Renaming itself is a separate step on the review screen and never happens on its own.
 */

import React from "react";
import { useStore } from "../store";
import { RadioCards, TextInput } from "../components";
import { NAMING_PRESETS, presetFor } from "../onboarding";
import { NamingPattern } from "@core/naming/NamingPattern";
import { HDSNaming } from "@core/naming/HDSNaming";
import { localDate } from "@core/images/PhotoMetadata";

export function NamingPicker() {
  const pattern = useStore((s) => s.settings.namingPattern);
  const photographer = useStore((s) => s.settings.photographer);
  const set = useStore((s) => s.setSetting);
  const preset = presetFor(pattern);
  const initials = HDSNaming.initials(photographer) || "EL";
  const example = (p: string) => NamingPattern.filename(p, { initials, date: localDate(2024, 9, 14), sportCode: "FB", covered: "Nebraska", opponent: "Ohio State", coveredIsHome: true }, 1, "jpg");
  const unknown = NamingPattern.unknownTokens(pattern);
  return (
    <div className="stack">
      <RadioCards name="naming" value={preset} onChange={(id) => { const p = NAMING_PRESETS.find((x) => x.id === id); if (p && p.pattern) set({ namingPattern: p.pattern }); }}
        options={NAMING_PRESETS.map((p) => ({ id: p.id, title: p.title, aside: p.pattern ? example(p.pattern) : example(pattern), detail: p.detail }))} />
      <div className="field">
        <span className="field-label">Pattern</span>
        <TextInput mono spellCheck={false} value={pattern} onChange={(e) => set({ namingPattern: e.target.value })} ariaLabel="File name pattern" />
        <span className="field-hint mono selectable">{example(pattern)}</span>
        {unknown.length > 0 && <span className="field-hint problem">Not a token this app knows: {unknown.join(", ")} — it will appear in the name exactly as written.</span>}
        <p className="tokens">{NamingPattern.tokens.map((t) => <span key={t.token}><code>{t.token}</code> {t.meaning} · </span>)}</p>
      </div>
    </div>
  );
}

export { React };
